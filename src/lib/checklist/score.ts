import type { Task } from "./types.ts";

export type Completion = {
  done: number;
  total: number;
  onTime: number;
  pct: number;
  points: number;
  label: string;
};

export function completion(tasks: Task[]): Completion {
  const visible = tasks.filter((task) => !task.deletedAt);
  const total = visible.length;
  const doneTasks = visible.filter((task) => task.done);
  const done = doneTasks.length;
  const onTime = doneTasks.filter((task) => task.onTime === true).length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  const points = done + onTime;
  const label = total === 0 ? "0 of 0" : `${done} of ${total}, ${pct}%`;
  return { done, total, onTime, pct, points, label };
}
