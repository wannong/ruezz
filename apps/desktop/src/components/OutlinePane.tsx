import type { OutlineItem } from "../lib/outline";

type OutlinePaneProps = {
  items: OutlineItem[];
  onJump: (id: string) => void;
};

export function OutlinePane({ items, onJump }: OutlinePaneProps) {
  if (items.length === 0) {
    return <div className="empty">当前页没有标题</div>;
  }

  return (
    <ul className="outline-list">
      {items.map((item) => (
        <li key={`${item.level}-${item.id}`}>
          <button
            type="button"
            className="outline-item"
            style={{ paddingLeft: 8 + (item.level - 1) * 12 }}
            onClick={() => onJump(item.id)}
          >
            {item.text}
          </button>
        </li>
      ))}
    </ul>
  );
}
