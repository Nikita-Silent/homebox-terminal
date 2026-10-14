import type { VariantProps } from "class-variance-authority"
import { cva } from "class-variance-authority"

export { default as Button } from "./Button.vue"

export const buttonVariants = cva(
  // Label-world button: square die-cut frame, condensed caps, inverts while pressed.
  "t-label inline-flex items-center justify-center gap-3 border-[3px] border-ink whitespace-nowrap transition-[background-color,color,transform] duration-150 select-none cursor-pointer disabled:pointer-events-none disabled:border-dashed disabled:bg-paper disabled:text-ink-soft focus-visible:outline-offset-[-9px] focus-visible:outline-[3px] active:translate-y-px [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-5 shrink-0 [&_svg]:shrink-0 [&_svg]:stroke-[2.5]",
  {
    variants: {
      variant: {
        default: "bg-ink text-paper hover:bg-ink-soft active:bg-paper active:text-ink",
        outline: "bg-paper text-ink hover:bg-wash active:bg-ink active:text-paper",
        ghost: "border-transparent bg-transparent text-ink hover:border-ink active:bg-ink active:text-paper",
        // No colour in this world: destructive differs only by its words and icon.
        destructive: "bg-ink text-paper hover:bg-ink-soft active:bg-paper active:text-ink",
        secondary: "bg-wash text-ink hover:bg-paper active:bg-ink active:text-paper",
        link: "border-transparent text-ink underline underline-offset-4 decoration-2",
      },
      size: {
        "default": "h-12 px-5 text-base",
        "sm": "h-10 px-4 text-sm",
        "lg": "h-14 px-7 text-lg",
        "icon": "size-12",
        "icon-lg": "size-16 [&_svg:not([class*='size-'])]:size-7",
        // Gloved hands: 64px minimum.
        "touch": "h-16 px-7 text-xl [&_svg:not([class*='size-'])]:size-6",
        "tile": "h-auto min-h-36 flex-col items-start justify-between p-6 text-3xl whitespace-normal text-left [&_svg:not([class*='size-'])]:size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)
export type ButtonVariants = VariantProps<typeof buttonVariants>
