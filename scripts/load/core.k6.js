/*
 * Load test for the busiest moment of a school day: teachers opening registers and score sheets,
 * parents checking fees, at the same time across many schools. Run with k6 (https://k6.io)
 * against a staging copy, never the live site:
 *
 *   k6 run -e BASE_URL=https://staging.example -e SESSION=<sos_session cookie of a test teacher> \
 *          -e SCHOOL=adalin-college scripts/load/core.k6.js
 *
 * The plan's target: 500 schools at once. Each virtual user is one busy member of staff, so the
 * default ramps to 500 and holds for five minutes. Pass: 95% of pages under 1.5 s, under 1% errors.
 */
import http from "k6/http";
import { check, sleep } from "k6";

const BASE = __ENV.BASE_URL;
const SCHOOL = __ENV.SCHOOL || "adalin-college";
const params = { headers: { Cookie: `sos_session=${__ENV.SESSION}` }, redirects: 0 };

export const options = {
  stages: [
    { duration: "2m", target: Number(__ENV.USERS || 500) },
    { duration: "5m", target: Number(__ENV.USERS || 500) },
    { duration: "1m", target: 0 },
  ],
  thresholds: {
    http_req_duration: ["p(95)<1500"],
    http_req_failed: ["rate<0.01"],
  },
};

const PAGES = [`/s/${SCHOOL}`, `/s/${SCHOOL}/attendance`, `/s/${SCHOOL}/results`, `/s/${SCHOOL}/students`, `/s/${SCHOOL}/fees`];

export default function busyStaffMember() {
  for (const path of PAGES) {
    const res = http.get(`${BASE}${path}`, params);
    check(res, { [`${path} loads`]: (r) => r.status === 200 });
    // A person reads a page for a few seconds before the next tap.
    sleep(2 + Math.random() * 3);
  }
  const login = http.get(`${BASE}/login`, { redirects: 0 });
  check(login, { "login page loads": (r) => r.status === 200 || r.status === 307 });
}
