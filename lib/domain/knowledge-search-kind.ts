/** Known display categories share a filter; custom kinds keep their exact meaning. */
export function knowledgeSearchKinds(kind: string) {
  const groups = [['person', '人物'], ['work', '作品'], ['organization', '組織'], ['event', '出来事']];
  return groups.find(values => values.includes(kind)) ?? [kind];
}
