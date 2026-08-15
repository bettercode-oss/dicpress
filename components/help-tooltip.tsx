"use client";

import { useState } from "react";
import { CircleHelp } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { DocModal } from "@/components/DocModal";
import { cn } from "@/lib/utils";

interface ModalData {
  title: string;
  content: string;
  slug: string;
}

interface HelpTooltipProps {
  content: string;
  side?: "top" | "right" | "bottom" | "left";
  className?: string;
  modalData?: ModalData;
}

export function HelpTooltip({ content, side = "top", className, modalData }: HelpTooltipProps) {
  const [open, setOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  function handleClick() {
    if (modalData) {
      setOpen(false);
      setModalOpen(true);
    } else {
      setOpen((o) => !o);
    }
  }

  return (
    <>
      <TooltipProvider delay={200}>
        <Tooltip open={open} onOpenChange={setOpen}>
          <TooltipTrigger
            aria-label={content}
            onClick={handleClick}
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
      {modalOpen && modalData && (
        <DocModal
          title={modalData.title}
          content={modalData.content}
          slug={modalData.slug}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}
