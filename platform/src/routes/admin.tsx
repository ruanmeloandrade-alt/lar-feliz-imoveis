import {createFileRoute,type RouteComponent} from '@tanstack/react-router';
import {Route as LoginRoute} from './login';
const AdminLogin=LoginRoute.options.component as RouteComponent;
export const Route=createFileRoute('/admin')({ssr:false,head:()=>({meta:[{title:'Entrar · Vanessa Simoni'}]}),component:AdminLogin});
