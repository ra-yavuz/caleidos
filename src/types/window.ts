// An open window on the desktop, rendering one app.
export type WindowEntry = {
  id: string;
  slug: string;
  title: string;
  pos: { x: number; y: number };
  size: { w: number; h: number };
  zIndex: number;
};
