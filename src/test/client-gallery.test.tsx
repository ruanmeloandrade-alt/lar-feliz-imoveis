import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import ClientPhotoGallery from '@/components/ClientPhotoGallery';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('shows all nine storage photos, including WebP and JPG extensions, and opens the original',async()=>{
  const photos=Array.from({length:9},(_,index)=>({src:`/api/client-gallery-media/000000000000${index+1}-00000000-0000-4000-8000-00000000000${index+1}.${index%2?'jpg':'webp'}`,alt:'Foto fornecida'}));
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({photos:[...photos,{src:'https://example.com/other.jpg',alt:'Externa'}]})}));
  render(<ClientPhotoGallery/>);
  const ninth=await screen.findByRole('button',{name:'Ampliar foto 9 da Vanessa com clientes'});
  expect(screen.getAllByRole('button',{name:/Ampliar foto/})).toHaveLength(9);
  fireEvent.click(ninth);
  expect(within(screen.getByRole('dialog')).getByRole('img')).toHaveAttribute('src',photos[8].src);
});
