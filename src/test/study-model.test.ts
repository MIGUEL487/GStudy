import { describe,it,expect } from 'vitest';
import { initialData,addNotebook,addCourse,courseUrl,loadData } from '@/lib/study-model';
describe('Notebook creation',()=>{
 it('creates a notebook in the selected subject without mutating other subjects',()=>{const data=initialData();const next=addNotebook(data,'subject-2','  Física moderna  ');expect(next.subjects[2]?.notebooks[0]).toMatchObject({title:'Física moderna',text:''});expect(next.subjects[0]?.notebooks).toHaveLength(0);expect(data.subjects[2]?.notebooks).toHaveLength(0);});
 it('rejects a blank title',()=>expect(()=>addNotebook(initialData(),'subject-0','  ')).toThrow());
 it('rejects a missing subject rather than writing to an undefined selection',()=>expect(()=>addNotebook(initialData(),'missing','Aula')).toThrow());
});
describe('Course creation',()=>{
 it('creates a course and normalizes a link without a protocol',()=>{const next=addCourse(initialData(),'subject-1','Meu curso','example.com/aula');expect(next.subjects[1]?.courses[0]).toMatchObject({title:'Meu curso',url:'https://example.com/aula'});});
 it('rejects unsafe and invalid links',()=>{expect(()=>courseUrl('javascript:alert(1)')).toThrow();expect(()=>courseUrl('não é um link')).toThrow();});
 it('migrates legacy notebooks and courses together',()=>{const records:Record<string,string>={materias:'["Física"]',cadernos:'{"Física":[{"titulo":"Aula 1","texto":"Anotações"}]}',cursos:'{"Física":[{"nome":"Curso 1","link":"https://example.com"}]}'};const loaded=loadData({getItem:key=>records[key]||null});expect(loaded.subjects[0]?.notebooks[0]?.text).toBe('Anotações');expect(loaded.subjects[0]?.courses[0]?.title).toBe('Curso 1');});
 it('does not swallow corrupt saved data',()=>expect(()=>loadData({getItem:()=>'{bad'})).toThrow());
});
