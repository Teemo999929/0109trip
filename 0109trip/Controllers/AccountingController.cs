using _0109trip.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace _0109trip.Controllers
{
    public class AccountingController : Controller
    {
        private readonly TravelDbContext _context;

        public AccountingController(TravelDbContext context)
        {
            _context = context;
        }

        public IActionResult Index()
        {
            var trips = _context.Trips.OrderByDescending(t => t.StartDate).ToList();
            return View(trips);
        }

        // 1. 取得成員列表 (包含已支出統計)
        [HttpGet]
        [ResponseCache(Location = ResponseCacheLocation.None, NoStore = true)]
        public async Task<IActionResult> GetTripMembers(int tripId)
        {
            var members = await (from tm in _context.TripMembers
                                 join u in _context.AspNetUsers on tm.UserId equals u.UserId
                                 where tm.TripId == tripId
                                 select new
                                 {
                                     MemberId = tm.Id, // 用於付款人 (ExpensePayer)
                                     UserId = tm.UserId, // 用於分攤人 (ExpenseParticipant)
                                     UserName = u.FullName ?? u.UserName,
                                     Budget = tm.Budget,
                                     // 計算該成員的累積支出
                                     TotalSpent = _context.ExpenseParticipants
                                          .Where(ep => ep.UserId == tm.Id && ep.Expense.TripId == tripId)
                                          .Sum(ep => (decimal?)ep.ShareAmount) ?? 0
                                 }).ToListAsync();

            return Json(new { count = members.Count, list = members });
        }

        // 2. 更新個人預算
        [HttpPost]
        public async Task<IActionResult> UpdateBudget(int tripId, int userId, decimal budget)
        {
            var member = await _context.TripMembers
                .FirstOrDefaultAsync(m => m.TripId == tripId && m.UserId == userId);

            if (member == null) return NotFound("成員不存在");
            member.Budget = budget;
            await _context.SaveChangesAsync();
            return Ok(new { success = true, message = "預算已更新" });
        }

        // 🔥🔥🔥 3. (新增) 取得單日支出資料 - 給切換天數用
        [HttpGet]
        [ResponseCache(Location = ResponseCacheLocation.None, NoStore = true)]
        public async Task<IActionResult> GetDailyExpenses(int tripId, int day)
        {
            var expenses = await _context.Expenses
                .Where(e => e.TripId == tripId && e.Day == day)
                .Include(e => e.Category)
                .Include(e => e.ExpensePayers).ThenInclude(ep => ep.Member).ThenInclude(m => m.User)
                .Include(e => e.ExpenseParticipants).ThenInclude(ep => ep.User).ThenInclude(m => m.User)
                .ToListAsync();

            // 轉成前端需要的 JSON 格式
            var result = expenses.Select(e => new
            {
                id = e.ExpenseId,
                name = e.Title,
                cat = e.Category?.Name ?? "其他",
                total = e.Amount,
                // 付款人
                payers = e.ExpensePayers.ToDictionary(
                    p => _context.AspNetUsers.FirstOrDefault(u => u.UserId == p.Member.UserId)?.FullName
                         ?? _context.AspNetUsers.FirstOrDefault(u => u.UserId == p.Member.UserId)?.UserName ?? "未知",
                    p => p.Amount),
                // 分攤人
                parts = e.ExpenseParticipants.ToDictionary(
                    p => _context.AspNetUsers.FirstOrDefault(u => u.UserId == p.UserId)?.FullName
                         ?? _context.AspNetUsers.FirstOrDefault(u => u.UserId == p.UserId)?.UserName ?? "未知",
                    p => p.ShareAmount)
            });

            return Json(result);
        }

        // 4. 建立支出 (修正 500 錯誤的核心)
        [HttpPost]
        public async Task<IActionResult> CreateExpense([FromBody] CreateExpenseViewModel model)
        {
            try
            {
                if (model == null) return BadRequest("model is null");
                if (model.TotalAmount <= 0) return BadRequest("金額錯誤");

                // 處理類別
                int? categoryId = null;
                if (!string.IsNullOrEmpty(model.CategoryName))
                {
                    var category = await _context.Categories.FirstOrDefaultAsync(c => c.Name == model.CategoryName);
                    categoryId = category?.CategoryId;
                }

                var expense = new Expense
                {
                    TripId = model.TripId,
                    Title = model.Title,
                    Amount = model.TotalAmount,
                    Day = model.Day,
                    CategoryId = categoryId
                };
                _context.Expenses.Add(expense);
                await _context.SaveChangesAsync(); // 先存檔取得 ExpenseId

                // 存付款人
                if (model.Payers != null)
                {
                    foreach (var payer in model.Payers)
                    {
                        var member = await _context.TripMembers.FirstOrDefaultAsync(m => m.TripId == model.TripId && m.UserId == payer.Key);
                        if (member != null)
                        {
                            _context.ExpensePayers.Add(new ExpensePayer
                            {
                                ExpenseId = expense.ExpenseId,
                                MemberId = member.Id,
                                Amount = payer.Value
                            });
                        }
                    }
                }

                // 🔥🔥🔥 存分攤人 (修正重點) 🔥🔥🔥
                if (model.Participants != null)
                {
                    foreach (var part in model.Participants)
                    {
                        // 1. 先用 UserId (part.Key) 找出這趟旅程的 TripMember
                        var member = await _context.TripMembers.FirstOrDefaultAsync(m => m.TripId == model.TripId && m.UserId == part.Key);

                        if (member != null)
                        {
                            // 2. 存入 ExpenseParticipants
                            _context.ExpenseParticipants.Add(new ExpenseParticipant
                            {
                                ExpenseId = expense.ExpenseId,
                                TripId = model.TripId,
                                // 🔥 重大修正：這裡必須存 TripMember.Id，不能存 UserId
                                // 因為資料庫的 FK 是指到 TripMembers 表
                                UserId = member.Id,
                                ShareAmount = part.Value
                            });
                        }
                    }
                }

                await _context.SaveChangesAsync();
                return Ok(new { success = true });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "伺服器錯誤", error = ex.Message, inner = ex.InnerException?.Message });
            }
        }
    }

    // ViewModel 建議加上初始化，避免 Null 錯誤
    public class CreateExpenseViewModel
        {
            public int TripId { get; set; }
            public int Day { get; set; }
            public string Title { get; set; }
            public string CategoryName { get; set; }
            public decimal TotalAmount { get; set; }
            // 預設給空字典，防止 foreach 跑到 null 當機
            public Dictionary<int, decimal> Payers { get; set; } = new Dictionary<int, decimal>();
            public Dictionary<int, decimal> Participants { get; set; } = new Dictionary<int, decimal>();
        }
    }
    