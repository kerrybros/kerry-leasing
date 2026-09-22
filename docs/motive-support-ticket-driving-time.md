SUBJECT: v2/driver_utilization driving_time does not match the Driver Fuel &
Performance report for the same driver/vehicle/day

Company: Wolverine Packing Co. -- [ADD MOTIVE COMPANY ID]
Contact: James Falk, Kerry Brothers Truck Repair -- james@kerrybros.com
API headers: X-Time-Zone: Eastern Time (US & Canada), X-Metric-Units: false


PROBLEM
-------
GET /v2/driver_utilization returns a much smaller driving_time than the Driver
Fuel & Performance report for the same driver, vehicle and day. idle_time and
idle_fuel match the report almost exactly. Only driving_time diverges, and only
on low-speed vehicles.

We calculate driver idle percentage as idle / (idle + driving) from the raw
idle_time and driving_time fields. The smaller API driving_time inflates that
percentage by 15-25 points on yard spotters.


EXHIBIT: TWO CONSECUTIVE DAYS, SAME DRIVER

Driver 5494534 (Rob Zimmerman, username 0346).
Aug 3 he was on road tractor 2264. Aug 4 he was on yard spotter 114.

Request: GET /v2/driver_utilization?start_date=2026-08-03&end_date=2026-08-03
         &driver_ids=5494534

Response:
{
    "driver": {
        "id": 5494534,
        "role": "driver",
        "email": "rzimmerman@wolverinepacking.com",
        "status": "active",
        "username": "0346",
        "last_name": "Zimmerman",
        "first_name": "Rob",
        "driver_company_id": ""
    },
    "idle_fuel": 0.264558970703125,
    "idle_time": 1006,
    "utilization": 94.1993888023987,
    "driving_fuel": 36.79652819921876,
    "driving_time": 16337
}

Request: GET /v2/driver_utilization?start_date=2026-08-04&end_date=2026-08-04
         &driver_ids=5494534

Response:
{
    "driver": {
        "id": 5494534,
        "role": "driver",
        "email": "rzimmerman@wolverinepacking.com",
        "status": "active",
        "username": "0346",
        "last_name": "Zimmerman",
        "first_name": "Rob",
        "driver_company_id": ""
    },
    "idle_fuel": 1.791416375,
    "idle_time": 8089,
    "utilization": 27.7316179755204,
    "driving_fuel": 1.105188328125,
    "driving_time": 3104
}

Same two days in the Driver Fuel & Performance report:

  Date   Field          API (converted)   Report      Match?
  -----  -------------  ---------------   ---------   ------
  08-03  driving_time   16337s = 4.54 hr   4.6 hr     yes
  08-03  idle_time       1006s = 0.28 hr   0.3 hr     yes
  08-03  idle_fuel       0.2646 gal        0.26 gal   yes

  08-04  driving_time    3104s = 0.86 hr   2.1 hr     NO -- 2.4x
  08-04  idle_time       8089s = 2.25 hr   2.2 hr     yes
  08-04  idle_fuel       1.7914 gal        1.79 gal   yes

On the road tractor every field agrees. On the yard spotter the next day, idle
and fuel still agree but driving_time is 2.4x smaller.


SCALE OF THE PROBLEM
--------------------
Across the fleet (79 driver-vehicle rows in July, 57 in August), report driving
time divided by API driving time:

  avg speed >= 45 mph (highway):    1.05x  -- agreement
  avg speed <  25 mph (yard work):  1.86x median, 3.07x max

Fleet-wide for Aug 1-16: idle_time agrees within 0.2%, idle_fuel within 0.2%,
driving_time differs by 11%.

For Zimmerman, week of Aug 3-9: API gives 62.9% idle, the report gives 46.2%.

For Zimmerman, Aug 1-16, three Motive sources for the same driver and window:

  v2/driver_utilization (19.86 driving + 26.60 idle)   46.46 hr
  Driver Fuel & Performance report (35.0 + 25.0)       59.96 hr
  driving_periods (sum of duration)                    58.74 hr

v2/driver_utilization accounts for about 13 fewer hours than the other two.


QUESTIONS
---------
1. What does driving_time in v2/driver_utilization measure? Is there a speed
   threshold, minimum segment duration, or HOS duty-status condition that
   excludes low-speed movement?

2. What is the report's "Driving Time (mins)" column derived from?

3. Is that report value available from any API endpoint? Which one? We need the
   dashboard and our integration to return the same number.


DOCUMENTATION DEFECT (reported ~18 months ago, still open)
----------------------------------------------------------
https://developer-docs.gomotive.com/reference/fetch-the-utilization-of-the-driver-v2
states idle_time is in seconds and driving_time is in minutes. Both cannot be
true. In the Aug 4 response above, driving_time 3104 as minutes would be 51.7
hours in one day. Also, utilization == driving_time / (driving_time +
idle_time) * 100 holds exactly across all 1,090 records we hold (max error
6e-14), which is only possible if both fields share a unit. Please correct the
docs to show both in seconds.
