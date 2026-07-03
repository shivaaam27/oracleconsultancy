import { Reveal } from "@/components/reveal";
import { TodoCard } from "@/components/todo-card";
import { listSelfTodos } from "@/lib/todo-reminders";
import { portalCreateTodo, portalToggleTodoDone, portalDeleteTodo, portalUpdateTodo } from "@/app/portal/actions";

/* Personal to-dos as a full-width board footer (managers + directors). A quick
 * work/life capture that pings you — kept separate from the portfolio work above
 * it. Staff have the same list on their Home. */
export async function BoardTodos({ personId, fill = false }: { personId: number; fill?: boolean }) {
  const items = await listSelfTodos(personId);
  return (
    <Reveal delay={0.05} className={fill ? "flex min-h-0 flex-1 flex-col" : undefined}>
      <TodoCard
        items={items}
        createAction={portalCreateTodo}
        toggleAction={portalToggleTodoDone}
        deleteAction={portalDeleteTodo}
        updateAction={portalUpdateTodo}
        title="To-Do List"
        fill={fill}
      />
    </Reveal>
  );
}
