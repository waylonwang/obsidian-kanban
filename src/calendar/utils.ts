/**
 * 日历组件共享工具函数
 * 用于统一处理任务标题清理逻辑
 */

/**
 * 清理title，移除日期时间标记
 */
export function cleanTitle(title: string, dateTrigger: string, timeTrigger: string): string {
  // 移除日期标记: %{YYYY-MM-DD} 或自定义触发符
  const datePattern = new RegExp(`${dateTrigger.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\{[^}]+\\}`, 'g');
  let cleaned = title.replace(datePattern, '');

  // 移除时间标记: %%{HH:MM} 或自定义触发符
  const timePattern = new RegExp(`${timeTrigger.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\{[^}]+\\}`, 'g');
  cleaned = cleaned.replace(timePattern, '');

  return cleaned.trim();
}

/**
 * 从title中移除优先级和负责人（当move-priorities-assignees开启时）
 */
export function removePrioritiesAndAssigneesFromTitle(title: string, priorities: string[], assignees: string[]): string {
  let cleaned = title;
  // 移除优先级标记 !priority
  priorities.forEach(p => {
    const pattern = new RegExp(`!${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
    cleaned = cleaned.replace(pattern, '');
  });
  // 移除负责人标记 @assignee
  assignees.forEach(a => {
    const pattern = new RegExp(`@${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
    cleaned = cleaned.replace(pattern, '');
  });
  return cleaned.trim();
}

/**
 * 从title中移除标签（当move-tags开启时）
 */
export function removeTagsFromTitle(title: string, tags: string[]): string {
  let cleaned = title;
  tags.forEach(tag => {
    // 标签可能是 #tag 或 tag 格式
    const tagPattern = new RegExp(`#${tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}|${tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
    cleaned = cleaned.replace(tagPattern, '');
  });
  return cleaned.trim();
}

/**
 * 移除 Obsidian block reference (^xxxx)
 */
export function removeBlockReference(title: string): string {
  return title.replace(/\^[a-zA-Z0-9]+/g, '').trim();
}

/**
 * 移除 markdown 格式（bold, italic, underline）
 */
export function removeMarkdownFormatting(title: string): string {
  let cleaned = title;
  cleaned = cleaned.replace(/\*\*(.*?)\*\*/g, '$1'); // Remove bold
  cleaned = cleaned.replace(/\*(.*?)\*/g, '$1'); // Remove italic
  cleaned = cleaned.replace(/__(.*?)__/g, '$1'); // Remove underline
  return cleaned.trim();
}

/**
 * 统一清理任务标题 - 用于所有日历任务
 */
export function cleanTaskTitle(
  title: string,
  dateTrigger: string,
  timeTrigger: string,
  movePrioritiesAssignees: boolean,
  moveTags: boolean,
  priorities: string[],
  assignees: string[],
  tags: string[]
): string {
  let cleaned = cleanTitle(title, dateTrigger, timeTrigger);
  cleaned = removeBlockReference(cleaned);
  cleaned = removeMarkdownFormatting(cleaned);

  if (movePrioritiesAssignees) {
    cleaned = removePrioritiesAndAssigneesFromTitle(cleaned, priorities, assignees);
  }

  if (moveTags) {
    cleaned = removeTagsFromTitle(cleaned, tags);
  }

  return cleaned.trim();
}