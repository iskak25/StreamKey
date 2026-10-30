import { connection } from "next/server";
import Logo from "@/components/Logo";

export default async function Home() {
  await connection(); // dynamic: the CSP nonce is applied per request
  return (
    <main className="page">
      <Logo width={260} plate />
      <p>Индивидуальные приглашения для просмотра YouTube Live.</p>
      <p className="muted">
        Ссылка ограничивает доступ к странице. YouTube Unlisted не защищает исходное видео от копирования и пересылки.
      </p>
    </main>
  );
}
