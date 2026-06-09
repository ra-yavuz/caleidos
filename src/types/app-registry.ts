// An app the agent has built, as discovered on disk under /apps/<slug>/.
export type AppMeta = {
  slug: string;
  title: string;
  description: string;
  createdAt: string;
};
