// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import KnowledgeEntityCorrectionFields from '../components/KnowledgeEntityCorrectionFields';
import {knowledgeEntityContentSchema} from '../lib/domain/knowledge-foundation';
import {entityCorrectionSchema} from '../lib/domain/knowledge-entity-correction';
afterEach(cleanup);
it('keeps incomplete corrections saveable and clears inherited language when original prose changes',()=>{
 const content=knowledgeEntityContentSchema.parse({name:'A',kind:'person',language:'en',description:'Original',textLanguages:{name:{tag:'en',basis:'declared'},description:{tag:'en',basis:'declared'}}}),onChange=vi.fn();
 const value={target:{id:'a',revision:2},content,reason:''};render(<KnowledgeEntityCorrectionFields value={value} before={content} locale="ja" onChange={onChange}/>);
 fireEvent.change(screen.getByLabelText('訂正後の名前'),{target:{value:''}});
 const changed=onChange.mock.calls[0][0];expect(changed.content.name).toBe('');expect(changed.content.language).toBe('und');expect(changed.content.textLanguages.name).toBeUndefined();expect(changed.content.textLanguages.description.tag).toBe('en');expect(entityCorrectionSchema.safeParse(changed).success).toBe(true);
 expect(screen.getByLabelText('訂正する理由')).toBeTruthy();expect(screen.getByText('訂正前の対象情報',{exact:false})).toBeTruthy();
});
