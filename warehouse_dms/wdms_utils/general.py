from datetime import date, timedelta


def get_week_range(today: date):
    """Return (start_of_week, end_of_week) for the ISO week containing *today*."""
    start = today - timedelta(days=today.weekday())
    end = start + timedelta(days=6)
    return start, end
