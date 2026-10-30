// @vitest-environment jsdom
import {afterEach,expect,it} from 'vitest';
import {cleanup,fireEvent,render} from '@testing-library/react';
import ProfileAvatar from '../components/ProfileAvatar';
import {googleProfileImage,publicProfileImage} from '../lib/domain/profile-image';
afterEach(cleanup);
const photo='https://lh3.googleusercontent.com/a/photo=s96-c';
it('accepts only HTTPS Google photo hosts and never publishes a nonselected image',()=>{
 expect(googleProfileImage(photo)).toBe(photo);
 for(const value of [null,'','javascript:alert(1)','data:image/png;base64,a','http://lh3.googleusercontent.com/a','https://lh3.googleusercontent.com.evil.test/a','https://evil.test/a','https://lh3.googleusercontent.com:444/a','https://user:pass@lh3.googleusercontent.com/a','https://lh3.googleusercontent.com/a#secret'])expect(googleProfileImage(value)).toBeNull();
 expect(publicProfileImage('person',photo)).toBeNull();expect(publicProfileImage('official-ai',photo)).toBeNull();
});
it('keeps avatar dimensions and falls back on missing, rejected or failed photos',()=>{
 const {container,rerender}=render(<ProfileAvatar icon="google" imageUrl={photo} small compact/>);
 let image=container.querySelector('img')!;expect(image.getAttribute('referrerpolicy')).toBe('no-referrer');
 expect(image.getAttribute('width')).toBe('36');fireEvent.error(image);
 expect(container.querySelector('img')).toBeNull();expect(container.querySelector('svg')).not.toBeNull();
 rerender(<ProfileAvatar icon="google" imageUrl={photo+'new'} small/>);expect(container.querySelector('img')).not.toBeNull();
 rerender(<ProfileAvatar icon="google" imageUrl="https://evil.test/a"/>);expect(container.querySelector('img')).toBeNull();
 rerender(<ProfileAvatar icon="leaf" imageUrl={photo}/>);expect(container.querySelector('img')).toBeNull();
 rerender(<ProfileAvatar icon="official-ai" imageUrl={photo}/>);image=container.querySelector('img')!;expect(image.getAttribute('src')).toBe('/ai/official-profile.png');
});
