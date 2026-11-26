import { Link } from "react-router";
import { Brand } from "../components/Brand";
import { usePageMeta } from "../lib/pageMeta";

export function NotFoundPage() {
  usePageMeta("Page not found | Twiniti Loop", "This Loop page does not exist.", {
    robots: "noindex, nofollow"
  });

  return (
    <div className="auth-page">
      <div className="auth-form-wrap">
        <Brand />
        <h1>Page not found</h1>
        <p className="muted">That URL is not part of Loop. Check the address or start from the homepage.</p>
        <p>
          <Link className="primary" to="/">
            Go to Loop home
          </Link>
        </p>
      </div>
    </div>
  );
}