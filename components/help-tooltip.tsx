"use client";

import { CircleHelp } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface HelpTooltipProps {
  content: string;
  side?: "top" | "right" | "bottom" | "left";
  className?: string;
}

export function HelpTooltip({ content, side = "top", className }: HelpTooltipProps) {
  return (
    <TooltipProvider delay={200}>
    <Tooltip>
      <TooltipTrigger
        aria-label={content}
        className={cn(
          "inline-flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors cursor-default focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-blue-500 rounded-full",
          className
        )}
      >
        <CircleHelp className="w-4 h-4" />
      </TooltipTrigger>
      <TooltipContent side={side}>{content}</TooltipContent>
    </Tooltip>
    </TooltipProvider>
  );
}
