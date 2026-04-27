import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";

import { cn } from "@/lib/utils";

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, orientation = "horizontal", ...props }, ref) => {
  const isVertical = orientation === "vertical";
  return (
    <SliderPrimitive.Root
      ref={ref}
      orientation={orientation}
      className={cn(
        "relative flex touch-none select-none",
        isVertical
          ? "h-full w-3 flex-col items-center justify-center px-3 py-1"
          : "w-full items-center py-3",
        className,
      )}
      style={{ touchAction: "none" }}
      {...props}
    >
      <SliderPrimitive.Track
        className={cn(
          "relative grow overflow-hidden rounded-full bg-primary/20",
          isVertical ? "h-full w-2" : "h-2 w-full",
        )}
      >
        <SliderPrimitive.Range
          className={cn(
            "absolute bg-primary",
            isVertical ? "w-full" : "h-full",
          )}
        />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        style={{ touchAction: "none" }}
        className="block h-6 w-6 rounded-full border border-primary/50 bg-background shadow transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
      />
    </SliderPrimitive.Root>
  );
});
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };
