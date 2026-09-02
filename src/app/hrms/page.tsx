import { redirect } from "next/navigation";

// The old HRMS hub (registry cards) duplicated the nav launcher; every
// destination now lives in the pill's "Go to" dialog. Old links land on the
// Administrator, the HRMS family's natural front door.
export default function HrmsHubRedirect() {
  redirect("/hrms/command-centre");
}
