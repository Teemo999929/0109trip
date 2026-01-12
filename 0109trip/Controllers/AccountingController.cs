using _0109trip.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace _0104trip.Controllers
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
        public async Task<IActionResult> GetTripMembers(int tripId)
        {
            // 撈取該行程的成員，並包含使用者的名字
            var members = await _context.TripMembers
                .Where(m => m.TripId == tripId)
                .Select(m => new {
                    UserId = m.UserId,
                    //UserName = m.User.UserName, // 假設你的 User 導覽屬性名稱是 User
                    Budget = m.Budget
                })
                .ToListAsync();

            return Json(members);
        }


    }
}
