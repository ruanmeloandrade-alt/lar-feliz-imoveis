// SLIM_AUDIENCE_OPERATIONS_V1
// SLIM_AUDIENCE_MASS_REDIRECT_V1
import {createFileRoute,redirect} from '@tanstack/react-router';
export const Route=createFileRoute('/disparo-em-massa')({beforeLoad:()=>{throw redirect({to:'/crm/publicos',search:{aba:'disparos'},replace:true});}});
