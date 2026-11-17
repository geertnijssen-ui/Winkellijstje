<script lang="ts">
	import { goto } from '$app/navigation';
	import { app } from '$lib/app.svelte';
	import { supabase } from '$lib/supabase';

	let householdName = $state('');
	let code = $state('');
	let busy = $state(false);
	let message = $state<string | null>(null);

	async function run(fn: 'create_household' | 'join_household') {
		busy = true;
		message = null;
		const { error } = await supabase.rpc(fn, fn === 'create_household' ? { p_name: householdName } : { p_code: code });
		busy = false;
		if (error) {
			message = error.message;
			return;
		}
		await app.refetch();
		goto('/', { replaceState: true });
	}
</script>

<main class="page stack">
	<h1>Welkom{app.me?.display_name ? `, ${app.me.display_name}` : ''}!</h1>
	<p class="muted">Jullie delen één lijst. De eerste maakt het huishouden aan, de tweede doet mee met de code.</p>

	<div class="card stack box">
		<strong>Nieuw huishouden</strong>
		<input class="input" placeholder="Bv. Thuis" bind:value={householdName} />
		<button class="btn block" disabled={busy} onclick={() => run('create_household')}>Aanmaken</button>
	</div>

	<div class="card stack box">
		<strong>Meedoen met een code</strong>
		<input class="input code" placeholder="ABC123" bind:value={code} maxlength="6" autocapitalize="characters" />
		<button class="btn block secondary" disabled={busy || code.trim().length < 6} onclick={() => run('join_household')}>Meedoen</button>
	</div>

	{#if message}<p class="small" style="color: var(--danger)">{message}</p>{/if}
	<button class="btn ghost" onclick={() => supabase.auth.signOut()}>Uitloggen</button>
</main>

<style>
	.box {
		padding: 16px;
	}
	.code {
		text-transform: uppercase;
		letter-spacing: 0.2em;
		text-align: center;
	}
</style>
