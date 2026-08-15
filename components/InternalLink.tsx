import { getEntrySummary } from "@/lib/entry-summary";
import { HelpTooltip } from "@/components/help-tooltip";
import { SITE_URL } from "@/lib/site";

type Props = React.AnchorHTMLAttributes<HTMLAnchorElement>;

export async function InternalLink({ href, children, ...props }: Props) {
  const prefix = SITE_URL + "/";

  if (!href?.startsWith(prefix)) {
    return <a href={href} {...props}>{children}</a>;
  }

  const slug = href.slice(prefix.length).split(/[?#]/)[0];
  const summary = await getEntrySummary(slug);

  return (
    <span className="inline-flex items-center gap-0.5">
      <a href={href} {...props}>{children}</a>
      {summary && <HelpTooltip content={summary} side="top" />}
    </span>
  );
}
