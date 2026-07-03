import { Reveal } from "@/components/reveal";
import { TodoCard } from "@/components/todo-card";
import { listSelfTodos } from "@/lib/todo-reminders";
import { portalCreateTodo, portalToggleTodoDone, portalDeleteTodo, portalUpdateTodo } from "@/app/portal/actions";

/* Personal to-dos as a full-width board footer (managers + directors). A quick
 * work/life capture that pings you — kept separate from the portfolio work above
 * it. Staff have the same list on their Home. */
export async function BoardTodos({ personId }: { personId: number }) {
  const items = await listSelfTodos(personId);
  return (
    <Reveal delay={0.05}>
      <TodoCard
        items={items}
        createAction={portalCreateTodo}
        toggleAction={portalToggleTodoDone}
        deleteAction={portalDeleteTodo}
        updateAction={portalUpdateTodo}
        title="To-Do List"
      />
    </Reveal>
  );
}
