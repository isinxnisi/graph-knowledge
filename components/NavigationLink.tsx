"use client";
import Link,{useLinkStatus} from 'next/link';
import type {ComponentProps} from 'react';
import {useNavigationProgress} from '../lib/client/navigation-progress';
function PendingNavigation(){const {pending}=useLinkStatus();useNavigationProgress(pending);return null;}
/** Uses the framework's actual navigation lifecycle, including cancellation,
 * prefetched links and rapid link changes. It does not observe global fetch. */
export default function NavigationLink({children,...props}:ComponentProps<typeof Link>){
 return <Link {...props}>{children}<PendingNavigation/></Link>;
}
