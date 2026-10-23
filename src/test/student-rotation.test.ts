import { describe, expect, it } from "vitest";
import { createStudentRotation } from "@/lib/student-rotation";
import { students, type StudentId } from "@/lib/students";

describe("Turma Feynman", () => {
  it.each(students.map(({ id }) => id))(
    "mantém a proporção 2:1 para %s e não repete convidados",
    (selected) => {
      let seed = 42;
      const random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
      const rotation = createStudentRotation(selected, random);
      let previousGuest: StudentId | undefined;
      for (let cycle = 0; cycle < 100; cycle++) {
        const bag: StudentId[] = [];
        for (let turn = 0; turn < 3; turn++) {
          const student = rotation.peek();
          // Reading or retrying a failed request must not consume a turn.
          expect(rotation.peek()).toBe(student);
          bag.push(student);
          rotation.commit();
        }
        expect(bag.filter((id) => id === selected)).toHaveLength(2);
        const guest = bag.find((id) => id !== selected)!;
        expect(guest).not.toBe(previousGuest);
        previousGuest = guest;
      }
    },
  );
});
