import Link from "next/link";
import { FamilyBadge, StatusBadge } from "@/components/Badge";
import SectionHeading from "@/components/SectionHeading";
import { fmtNum } from "@/lib/format";
import { getTreeData } from "@/lib/queries";
import type { TreeData } from "@/lib/queries";
import type { StrategyRow } from "@/lib/types";

export const dynamic = "force-dynamic";

function NodeLabel({
  s,
  mutationType,
  crossover,
}: {
  s: StrategyRow;
  mutationType: string | null;
  crossover: boolean;
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-2 py-0.5 text-xs">
      <Link
        href={`/strategies/${s.strategy_id}`}
        className="font-medium text-fg hover:text-amber hover:underline"
      >
        {s.name}
      </Link>
      <span className="num text-[10px] text-faint">
        {s.strategy_id} · G{s.generation}
      </span>
      <StatusBadge status={s.status} />
      <span className="num text-[10px] text-amber">
        {fmtNum(s.fitness, 3)}
      </span>
      {mutationType && (
        <span className="rounded bg-panel2 px-1.5 py-0.5 font-mono text-[9px] text-violet">
          {mutationType}
        </span>
      )}
      {crossover && (
        <span className="font-mono text-[9px] italic text-faint">
          (crossover — appears under each parent)
        </span>
      )}
    </span>
  );
}

function TreeNode({
  id,
  tree,
  mutationType,
  depth,
  path,
}: {
  id: string;
  tree: TreeData;
  mutationType: string | null;
  depth: number;
  path: Set<string>;
}) {
  const s = tree.strategies.get(id);
  if (!s) return null;
  const crossover = (tree.parentCount.get(id) ?? 0) > 1;

  if (path.has(id)) {
    // cycle guard — should not happen, but never recurse forever
    return (
      <div className="pl-5 text-[10px] text-faint">
        {s.name} (already shown above)
      </div>
    );
  }
  const children = tree.childrenOf.get(id) ?? [];
  const label = (
    <NodeLabel s={s} mutationType={mutationType} crossover={crossover} />
  );

  if (children.length === 0) {
    return (
      <div className="flex items-start gap-1.5 border-l border-bd pl-3">
        <span className="mt-1 inline-block h-1 w-1 shrink-0 rounded-full bg-bd2" />
        {label}
      </div>
    );
  }

  const nextPath = new Set(path);
  nextPath.add(id);

  return (
    <details className="tree border-l border-bd pl-3" open={depth < 1}>
      <summary className="flex items-start gap-1.5">
        <span className="caret mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border border-bd2 font-mono text-[10px] text-muted" />
        {label}
        <span className="mt-0.5 font-mono text-[9px] text-faint">
          {children.length} child{children.length === 1 ? "" : "ren"}
        </span>
      </summary>
      <div className="ml-4 mt-1 space-y-1">
        {children.map((c, i) => (
          <TreeNode
            key={`${c.child_id}-${i}`}
            id={c.child_id}
            tree={tree}
            mutationType={c.mutation_type}
            depth={depth + 1}
            path={nextPath}
          />
        ))}
      </div>
    </details>
  );
}

export default function EvolutionTreePage() {
  const tree = getTreeData();
  const rootsByFamily = new Map<string, StrategyRow[]>();
  for (const r of tree.roots) {
    const arr = rootsByFamily.get(r.family) ?? [];
    arr.push(r);
    rootsByFamily.set(r.family, arr);
  }
  const families = [...rootsByFamily.keys()].sort();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-mono text-xl font-bold tracking-wide">
          Evolution Tree
        </h1>
        <p className="mt-1 text-xs text-muted">
          Genealogy of {tree.strategies.size} strategies from{" "}
          {tree.roots.length} generation-0 seeds. Crossover children appear
          under each parent. Click a node to expand its descendants.
        </p>
      </div>

      {families.map((fam) => (
        <section key={fam}>
          <SectionHeading
            title={fam.replace(/_/g, " ")}
            right={<FamilyBadge family={fam} />}
          />
          <div className="space-y-2 rounded-lg border border-bd bg-panel p-4">
            {(rootsByFamily.get(fam) ?? []).map((root) => (
              <TreeNode
                key={root.strategy_id}
                id={root.strategy_id}
                tree={tree}
                mutationType={root.mutation_type}
                depth={0}
                path={new Set()}
              />
            ))}
          </div>
        </section>
      ))}

      {tree.roots.length === 0 && (
        <div className="rounded-lg border border-bd bg-panel p-5 text-sm text-faint">
          No seed strategies found.
        </div>
      )}
    </div>
  );
}
