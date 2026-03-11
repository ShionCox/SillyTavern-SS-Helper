declare const SillyTavern: {
  getContext(): any;
  libs: any;
};

declare module "*.html?raw" {
  const content: string;
  export default content;
}

declare module "*.css?inline" {
  const content: string;
  export default content;
}
