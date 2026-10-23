import { students, type StudentId } from "./students";

/** Each completed bag has two turns by the chosen student and one guest. */
export function createStudentRotation(selected: StudentId, random = Math.random) {
  let bag: StudentId[] = [];
  let previousGuest: StudentId | undefined;
  const index = (length: number) =>
    Math.min(length - 1, Math.max(0, Math.floor(random() * length)));
  return {
    peek(): StudentId {
      if (!bag.length) {
        const guests = students.filter(({ id }) => id !== selected && id !== previousGuest);
        const guest = guests[index(guests.length)]!.id;
        previousGuest = guest;
        bag = [selected, selected, guest];
        for (let i = bag.length - 1; i > 0; i--) {
          const j = index(i + 1);
          [bag[i], bag[j]] = [bag[j]!, bag[i]!];
        }
      }
      return bag[0]!;
    },
    commit() {
      bag.shift();
    },
  };
}
