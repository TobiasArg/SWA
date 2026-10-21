const createdAt = "2026-10-21T12:00:00.000Z";
const groupCount = 10;
const componentsPerGroup = 10;
const componentWidth = 220;
const componentHeight = 88;
const componentGapX = 250;
const componentGapY = 120;
const groupGapX = 1500;
const groupGapY = 500;

const components = Array.from({ length: 100 }, (_, index) => {
  const groupIndex = Math.floor(index / componentsPerGroup);
  const withinGroup = index % componentsPerGroup;
  const column = withinGroup % 5;
  const row = Math.floor(withinGroup / 5);
  return {
    id: `perf-cmp-${index + 1}`,
    type: "agent" as const,
    name: `Load Test Agent ${String(index + 1).padStart(3, "0")}`,
    position: {
      x: (groupIndex % 2) * groupGapX + 24 + column * componentGapX,
      y: Math.floor(groupIndex / 2) * groupGapY + 56 + row * componentGapY,
    },
  };
});

const relationships = Array.from({ length: 150 }, (_, index) => {
  const undirected = index % 5 === 0;
  return {
    id: `perf-rel-${index + 1}`,
    type: undirected ? "shares_context_with" : "uses",
    sourceId: components[index % components.length]!.id,
    targetId: components[(index + 1) % components.length]!.id,
    direction: undirected ? "undirected" : "directed",
    label: `Load path ${index + 1}`,
  };
});

const groups = Array.from({ length: groupCount }, (_, index) => ({
  id: `perf-grp-${index + 1}`,
  name: `Load Test Group ${index + 1}`,
  memberComponentIds: components
    .slice(index * componentsPerGroup, (index + 1) * componentsPerGroup)
    .map((component) => component.id),
  bounds: {
    x: (index % 2) * groupGapX,
    y: Math.floor(index / 2) * groupGapY,
    width: 48 + 4 * componentGapX + componentWidth,
    height: 24 + 32 + componentGapY + componentHeight + 24,
  },
}));

export const performanceFixture = {
  schemaVersion: 1,
  architecture: {
    id: "arch-performance-fixture",
    name: "Performance Fixture — 100 Components",
    createdAt,
    updatedAt: createdAt,
    components,
    relationships,
    groups,
    canvas: { viewport: { x: 0, y: 0, zoom: 0.45 } },
  },
};
