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
        public async Task<IActionResult> GetTripMembers(int tripId)
        {
            var members = await (from tm in _context.TripMembers
                                     // 修正點在此：將 u.Id 改為 u.UserId
                                 join u in _context.AspNetUsers on tm.UserId equals u.UserId
                                 where tm.TripId == tripId
                                 select new
                                 {
                                     UserId = tm.UserId,
                                     UserName = u.UserName,
                                     Budget = tm.Budget
                                 }).ToListAsync();

            return Json(new { count = members.Count, list = members });
        }


    }
}
