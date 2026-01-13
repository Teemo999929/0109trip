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

        // 進入記帳主頁面
        public IActionResult Index()
        {
            // 撈取所有行程，並包含成員資料
            var trips = _context.Trips
                .OrderByDescending(t => t.StartDate)
                .ToList();

            return View(trips);
        }
        [HttpGet]
        [ResponseCache(Location = ResponseCacheLocation.None, NoStore = true)]
        public async Task<IActionResult> GetTripMembers(int tripId)
        {
            var members = await (from tm in _context.TripMembers
                                     // 修正點在此：將 u.Id 改為 u.UserId
                                 join u in _context.AspNetUsers on tm.UserId equals u.UserId
                                 where tm.TripId == tripId
                                 select new
                                 {
                                     UserId = tm.UserId,
                                     UserName = u.FullName ?? u.UserName,
                                     Budget = tm.Budget,
                                     TotalSpent = _context.ExpenseParticipants
                                          .Where(ep => ep.UserId == tm.UserId && ep.Expense.TripId == tripId)
                                          .Sum(ep => (decimal?)ep.ShareAmount) ?? 0
                                 }).ToListAsync();

            return Json(new { count = members.Count, list = members });
        }
        [HttpPost]
        public async Task<IActionResult> UpdateBudget(int tripId, int userId, decimal budget)
        {
            // 1. 找出該成員
            var member = await _context.TripMembers
                .FirstOrDefaultAsync(m => m.TripId == tripId && m.UserId == userId);

            if (member == null) return NotFound("成員不存在");
            // 2. 更新預算
            member.Budget = budget;
            await _context.SaveChangesAsync();
            // 3. 回傳成功訊息
            return Ok(new { success = true, message = "預算已更新" });
        }


    }
}
