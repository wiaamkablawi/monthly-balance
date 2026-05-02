import React from "react";

type IconName = "dashboard" | "plus" | "journal" | "report" | "settings" | "search" | "help" | "bell" | "logout";

export default function AppIcon(props: { name: IconName; className?: string }) {
  const { name, className } = props;

  switch (name) {
    case "dashboard":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="4.5" rx="1.5" />
          <rect x="14" y="10.5" width="7" height="10.5" rx="1.5" />
          <rect x="3" y="13.5" width="7" height="7.5" rx="1.5" />
        </svg>
      );
    case "plus":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
      );
    case "journal":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 19.5h14" />
          <path d="M7.5 16V9.5" />
          <path d="M12 16V5.5" />
          <path d="M16.5 16v-4" />
        </svg>
      );
    case "report":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="3" width="16" height="18" rx="2" />
          <path d="M8 7h8" />
          <path d="M8 11h8" />
          <path d="M8 15h5" />
        </svg>
      );
    case "settings":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3.75l1.43 1.02 1.78-.2.9 1.55 1.65.72v1.79l1.22 1.31-.82 1.59.33 1.76-1.36 1.07-.44 1.74-1.79.19-1.19 1.35-1.71-.55-1.71.55-1.19-1.35-1.79-.19-.44-1.74-1.36-1.07.33-1.76-.82-1.59L4 8.84V7.05l1.65-.72.9-1.55 1.78.2L12 3.75z" />
          <circle cx="12" cy="12" r="3.2" />
        </svg>
      );
    case "search":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="6.5" />
          <path d="M16 16l4 4" />
        </svg>
      );
    case "help":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9.1 9a3 3 0 0 1 5.8.8c0 2-2.9 2.4-2.9 4.4" />
          <path d="M12 17h.01" />
          <circle cx="12" cy="12" r="9" />
        </svg>
      );
    case "bell":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 17h5l-1.4-1.6a2 2 0 0 1-.5-1.31V10a6.1 6.1 0 0 0-4.5-5.9" />
          <path d="M9 17H4l1.4-1.6a2 2 0 0 0 .5-1.31V10a6.1 6.1 0 0 1 12.2 0v4.09c0 .49.18.96.5 1.31L20 17H9z" />
          <path d="M9.5 17a2.5 2.5 0 0 0 5 0" />
        </svg>
      );
    case "logout":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 17l5-5-5-5" />
          <path d="M15 12H4" />
          <path d="M20 4v16" />
        </svg>
      );
    default:
      return null;
  }
}
