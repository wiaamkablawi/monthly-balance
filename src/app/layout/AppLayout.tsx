import React from "react";
import BottomNav from "../../components/BottomNav";

export default function AppLayout(props: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <>
      <header className="header">
        <div className="header-inner">
          <div className="title">{props.title}</div>
          <div className="row">{props.right}</div>
        </div>
      </header>

      <main className="container">{props.children}</main>

    </>
  );
}
