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
                                     MemberId = tm.Id, // 用於付款人
                                     UserId = tm.UserId, // 用於分攤人
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

        // 3. (新增) 取得單日支出資料
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

            var result = expenses.Select(e => new
            {
                id = e.ExpenseId,
                name = e.Title,
                cat = e.Category?.Name ?? "其他",
                total = e.Amount,
                payers = e.ExpensePayers.ToDictionary(
                    p => _context.AspNetUsers.FirstOrDefault(u => u.UserId == p.Member.UserId)?.FullName
                         ?? _context.AspNetUsers.FirstOrDefault(u => u.UserId == p.Member.UserId)?.UserName ?? "未知",
                    p => p.Amount),
                parts = e.ExpenseParticipants.ToDictionary(
                    p => _context.AspNetUsers.FirstOrDefault(u => u.UserId == p.UserId)?.FullName
                         ?? _context.AspNetUsers.FirstOrDefault(u => u.UserId == p.UserId)?.UserName ?? "未知",
                    p => p.ShareAmount)
            });

            return Json(result);
        }

        // 4. 建立支出 
        [HttpPost]
        public async Task<IActionResult> CreateExpense([FromBody] CreateExpenseViewModel model)
        {
            try
            {
                if (model == null) return BadRequest("model is null");
                if (model.TotalAmount <= 0) return BadRequest("金額錯誤");

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
                await _context.SaveChangesAsync();

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

                // 存分攤人
                if (model.Participants != null)
                {
                    foreach (var part in model.Participants)
                    {
                        var member = await _context.TripMembers.FirstOrDefaultAsync(m => m.TripId == model.TripId && m.UserId == part.Key);
                        if (member != null)
                        {
                            _context.ExpenseParticipants.Add(new ExpenseParticipant
                            {
                                ExpenseId = expense.ExpenseId,
                                TripId = model.TripId,
                                UserId = member.Id, // 存 TripMemberId
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

        // 5. (新增) 刪除支出
        [HttpPost]
        public async Task<IActionResult> DeleteExpense(int expenseId)
        {
            var expense = await _context.Expenses.FindAsync(expenseId);
            if (expense == null) return NotFound("找不到該筆支出");

            _context.Expenses.Remove(expense);
            await _context.SaveChangesAsync();

            return Ok(new { success = true });
        }

        // 6. (新增) 更新支出
        [HttpPost]
        public async Task<IActionResult> UpdateExpense([FromBody] UpdateExpenseViewModel model)
        {
            try
            {
                if (model == null) return BadRequest("model is null");

                var expense = await _context.Expenses
                    .Include(e => e.ExpensePayers)
                    .Include(e => e.ExpenseParticipants)
                    .FirstOrDefaultAsync(e => e.ExpenseId == model.ExpenseId);

                if (expense == null) return NotFound("找不到該筆支出");

                // 更新基本欄位
                expense.Title = model.Title;
                expense.Amount = model.TotalAmount;
                expense.CategoryId = (await _context.Categories.FirstOrDefaultAsync(c => c.Name == model.CategoryName))?.CategoryId;

                // 清除舊的關聯
                _context.ExpensePayers.RemoveRange(expense.ExpensePayers);
                _context.ExpenseParticipants.RemoveRange(expense.ExpenseParticipants);

                // 加入新的付款人
                if (model.Payers != null)
                {
                    foreach (var payer in model.Payers)
                    {
                        var member = await _context.TripMembers.FirstOrDefaultAsync(m => m.TripId == expense.TripId && m.UserId == payer.Key);
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

                // 加入新的分攤人
                if (model.Participants != null)
                {
                    foreach (var part in model.Participants)
                    {
                        var member = await _context.TripMembers.FirstOrDefaultAsync(m => m.TripId == expense.TripId && m.UserId == part.Key);
                        if (member != null)
                        {
                            _context.ExpenseParticipants.Add(new ExpenseParticipant
                            {
                                ExpenseId = expense.ExpenseId,
                                TripId = expense.TripId,
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
                return StatusCode(500, new { message = "更新失敗", error = ex.Message });
            }
        }

        // 🔥🔥🔥 7. (新增) 取得所有支出類別
        [HttpGet]
        [ResponseCache(Location = ResponseCacheLocation.None, NoStore = true)]
        public async Task<IActionResult> GetCategories()
        {
            // 只撈取 Name 欄位回傳成字串陣列，例如 ["食物", "交通", "住宿"]
            var categories = await _context.Categories
                .Select(c => c.Name)
                .ToListAsync();

            return Json(categories);
        }

    } // <--- AccountingController 的結束括號在這裡，所有方法都要在它上面！

    // ViewModels 定義在 Namespace 裡面，Controller 外面，這樣最乾淨
    public class CreateExpenseViewModel
    {
        public int TripId { get; set; }
        public int Day { get; set; }
        public string Title { get; set; }
        public string CategoryName { get; set; }
        public decimal TotalAmount { get; set; }
        public Dictionary<int, decimal> Payers { get; set; } = new Dictionary<int, decimal>();
        public Dictionary<int, decimal> Participants { get; set; } = new Dictionary<int, decimal>();
    }

    public class UpdateExpenseViewModel
    {
        public int ExpenseId { get; set; }
        public string Title { get; set; }
        public string CategoryName { get; set; }
        public decimal TotalAmount { get; set; }
        public Dictionary<int, decimal> Payers { get; set; } = new Dictionary<int, decimal>();
        public Dictionary<int, decimal> Participants { get; set; } = new Dictionary<int, decimal>();
    }


} 