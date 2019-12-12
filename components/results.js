import React from 'react'
import GraphComponent from './graphComponent';
import Link from 'next/link';
import Button from 'react-bootstrap/Button'
import Router from 'next/router';

const Result = ({action, results}) => {
    const {fileResults, pageFound, graphDetails} = results;
    let actionLabel = '';
    let pageFoundLabel = '';
    let graphSection = <span></span>;
    switch(action){
        case 'upload':
            actionLabel = 'Upload';
            break;
        case 'scan':
            actionLabel = 'Scan';
            break;
    }
    
    if(pageFound){
        pageFoundLabel = <span>for <a target="_blank" href={pageFound}>{pageFound}</a></span>
    }

    if(graphDetails != null){
        graphSection = <div>
           
            <GraphComponent details={graphDetails}/>
        </div>
    }


    let fileResultsView = <span></span>;


    return (
        <div>
            <Button variant="primary" onClick={()=> Router.back()}>
                Back
            </Button>
            <br/>
            <br/>
            <h3>{actionLabel} Results {pageFoundLabel}</h3>
            
            {fileResultsView}
            <br/>
            {graphSection}

        </div>
    )
}

export default Result
