import { getEntry } from "@/lib/entry-summary";
import { HelpTooltip } from "@/components/help-tooltip";
import { SITE_URL } from "@/lib/site";

type Props = React.AnchorHTMLAttributes<HTMLAnchorElement>;

export async function InternalLink({ href, children, ...props }: Props) {
  const prefix = SITE_URL + "/";

  if (!href?.startsWith(prefix)) {
    return <a href={href} {...props}>{children}</a>;
  }

  const slug = href.slice(prefix.length).split(/[?#]/)[0];
  const entry = await getEntry(slug);

  return (
    <span className="inline-flex items-center gap-0.5">
      <a href={href} {...props}>{children}</a>
      {entry.summary && (
        <HelpTooltip
          content={entry.summary}
          side="top"
          modalData={
            entry.title && entry.content
              ? { title: entry.title, content: entry.content, slug }
              : undefined
          }
        />
      )}
    </span>
  );
}
