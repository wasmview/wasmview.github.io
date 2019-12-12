import React from 'react';
import App, { Container } from 'next/app';
import Navbar from 'react-bootstrap/Navbar'
import Nav from 'react-bootstrap/Nav'
import Link from 'next/link';
import Head from 'next/head';
import Router from 'next/router';
import '../styles/_app.css';

class Layout extends React.Component {
    // <Link href="/">
    // <Nav.Link href="#home">Home</Nav.Link>
    // </Link>
    render () {
        const { children } = this.props
        return <div className='layout'>
            <div className="colored-background">
            <Navbar variant="dark" expand="lg">
                <Link href="/">
                        <Navbar.Brand >WasmView</Navbar.Brand>
                </Link>
                <Navbar.Toggle aria-controls="basic-navbar-nav" />
                <Navbar.Collapse id="basic-navbar-nav">
                    <Nav className="mr-auto">
                    
                    </Nav>
                </Navbar.Collapse>
                </Navbar>
            <br/>

            <div className="container">
                <h1 className="display-4">WasmView</h1>
                <p className="lead">This is a utility to analyze a website using WebAssembly of your choosing. You
                    can enter a webpage URL below:</p>
            </div>
            <br/>
            <hr/>

        </div>
        <div className="container">
            {children}
        </div>
        </div>
    }
    }


class MyApp extends App {

    render() {
    const { Component, pageProps } = this.props;

    return (
        <Container>
            <Head>
                <title>WasmView</title>
                <link rel="shortcut icon" type="image/x-icon" href="/favicon.ico" />
            </Head>
            <Layout>
                <Component {...pageProps} />
            </Layout>
        </Container>
    );
    }
}

export default MyApp;