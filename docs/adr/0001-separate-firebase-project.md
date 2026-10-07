# Separate Firebase project for Postdrop auth

Postdrop's Dashboard needs authentication, and the proven pattern lives in agent-utils (Firebase Auth client SDK sign-in + Admin SDK `verifyIdToken` server-side). We decided to create a fresh Firebase project for Postdrop and copy the pattern rather than reuse the agent-utils project, because the approved spec locks Postdrop as separate from agent-utils until the product proves itself, and a shared project couples user lists, billing code, and security blast radius across two products (agent-utils has already had a P0 where raw bearer UIDs were trusted — that class of bug must not span two products).

Consequence: if the products ever merge, Account UIDs need a Firebase-to-Firebase migration; accepted in exchange for isolation now.
