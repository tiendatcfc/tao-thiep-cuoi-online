import type { DetailedHTMLProps, HTMLAttributes } from "react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "lite-youtube": DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        videoid: string;
        playlabel?: string;
      };
    }
  }
}
