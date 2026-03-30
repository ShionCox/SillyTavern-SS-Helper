interface ImportMeta {
  /**
   * 功能：声明 Vite 的 glob 模块收集能力，供共享 SDK 在类型检查时使用。
   * @param pattern 匹配模式
   * @param options 收集选项
   * @returns 模块路径到模块值的映射
   */
  glob<T = unknown>(
    pattern: string,
    options?: {
      eager?: boolean;
      import?: string;
      query?: string;
    },
  ): Record<string, T>;
}
