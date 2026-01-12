using System;
using System.Collections.Generic;

namespace _0109trip.Models;

public partial class Preference
{
    public int UserId { get; set; }

    public int GroupId { get; set; }

    public int? BudgetMin { get; set; }

    public int? BudgetMax { get; set; }

    public int? HotelRating { get; set; }

    public bool Tranfer { get; set; }

    public int? TotalBudget { get; set; }

    public string? PlacesToGo { get; set; }

    public DateTime CreatedAt { get; set; }

    public virtual TravelGroup Group { get; set; } = null!;

    public virtual AspNetUser User { get; set; } = null!;
}
