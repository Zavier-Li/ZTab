import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Modal } from "./ui/dialog";
import { Button } from "./ui/button";
import { type PageProps } from "./shared";
import { appendDrawSnapshot, type Round, type Room } from "@/lib/types";
import { validateDraw } from "@/lib/pairing";
import { errorText } from "@/lib/utils";
import { t as tr } from "@/lib/i18n";
export default function PanelEditor({
  p,
  round,
  room,
  onClose,
  update,
  notify,
}: PageProps & { round: Round; room: Room; onClose: () => void }) {
  const [items, setItems] = useState(room.judges);
  async function save() {
    try {
      if (items.filter((j) => j.role === "Chair").length !== 1)
        throw new Error(tr("主裁必须恰好一位"));
      const next = structuredClone(p),
        r = next.rounds.find((r) => r.id === round.id)!;
      r.rooms.find((rr) => rr.id === room.id)!.judges = items;
      const errors = validateDraw(next, r).errors.filter(
        (e) => e !== "赛场缺少主裁",
      );
      if (errors.length) throw new Error(errors.join("；"));
      if (next.randomMeta) delete next.randomMeta.resources;
      await update(appendDrawSnapshot(next, 'edited'));
      notify(tr("裁判组已保存"));
      onClose();
    } catch (e) {
      notify(errorText(e), true);
    }
  }
  return (
    <Modal
      open
      title={tr("编辑裁判组")}
      description={tr("每个赛场的裁判可以单独增减，并设置主裁、副裁或计时员。")}
      onClose={onClose}
    >
      <div className="entity-form">
        {items.map((j, i) => (
          <div className="panel-editor-row" key={i}>
            <label>
              {tr("裁判")}
              <select
                aria-label={`${tr("裁判")} ${i + 1}`}
                value={j.id}
                onChange={(e) =>
                  setItems(
                    items.map((old, k) =>
                      k === i ? { ...old, id: e.target.value } : old,
                    ),
                  )
                }
              >
                {p.judges
                  .filter((j) => j.active || j.id === items[i].id)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              {tr("裁判角色")}
              <select
                value={j.role}
                onChange={(e) =>
                  setItems(
                    items.map((old, k) =>
                      k === i
                        ? { ...old, role: e.target.value as typeof j.role }
                        : old,
                    ),
                  )
                }
              >
                <option value="Chair">{tr("主裁")}</option>
                <option value="Panel">{tr("副裁")}</option>
                <option value="Timer">{tr("计时")}</option>
              </select>
            </label>
            <Button
              variant="ghost"
              size="icon"
              aria-label={tr("移除")}
              onClick={() => setItems(items.filter((_, k) => k !== i))}
            >
              <Trash2 size={16} />
            </Button>
          </div>
        ))}
        <Button
          variant="outline"
          disabled={
            !p.judges.some(
              (j) => j.active && !items.some((item) => item.id === j.id),
            )
          }
          onClick={() => {
            const j = p.judges.find(
              (j) => j.active && !items.some((item) => item.id === j.id),
            );
            if (j)
              setItems([
                ...items,
                {
                  id: j.id,
                  role: items.some((j) => j.role === "Chair")
                    ? "Panel"
                    : "Chair",
                },
              ]);
          }}
        >
          <Plus size={15} />
          {tr("添加裁判")}
        </Button>
        <div className="modal-actions">
          <Button variant="outline" onClick={onClose}>
            {tr("取消")}
          </Button>
          <Button onClick={() => void save()}>{tr("保存调整")}</Button>
        </div>
      </div>
    </Modal>
  );
}
