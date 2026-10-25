import PersonalFrame from '../../components/PersonalFrame';
import {datasetMode} from '../../lib/domain/dataset';
import type {ReactNode} from 'react';
export default function Layout({children}:{children:ReactNode}){return <PersonalFrame dataset={datasetMode(process.env.GRAPH_DATASET)}>{children}</PersonalFrame>;}
