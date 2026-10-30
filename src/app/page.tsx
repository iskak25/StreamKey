import { redirect } from "next/navigation";

// The cabinet is the main screen. Without a session the (account) layout sends the visitor on to /login.
export default function Home() {
  redirect("/dashboard");
}
