<script lang="ts">
	import { supabase } from '$lib/supabase';

	let mode = $state<'login' | 'signup'>('login');
	let email = $state('');
	let password = $state('');
	let name = $state('');
	let busy = $state(false);
	let message = $state<string | null>(null);

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		busy = true;
		message = null;
		const { error, data } =
			mode === 'login'
				? await supabase.auth.signInWithPassword({ email, password })
				: await supabase.auth.signUp({ email, password, options: { data: { display_name: name.trim() } } });
		busy = false;
		if (error) message = error.message === 'Invalid login credentials' ? 'E-mail of wachtwoord klopt niet.' : error.message;
		else if (mode === 'signup' && !data.session) message = 'Check je mailbox om je account te bevestigen, en log daarna in.';
	}
</script>

<main class="page login">
	<img src="/icon.svg" alt="" width="64" height="64" />
	<h1>Winkellijstje</h1>
	<p class="muted">Jullie gedeelde boodschappenlijst, netjes per winkel.</p>

	<form class="stack" onsubmit={submit}>
		{#if mode === 'signup'}
			<input class="input" placeholder="Je voornaam" bind:value={name} required autocomplete="given-name" />
		{/if}
		<input class="input" type="email" placeholder="E-mailadres" bind:value={email} required autocomplete="email" />
		<input
			class="input"
			type="password"
			placeholder="Wachtwoord"
			bind:value={password}
			required
			minlength="8"
			autocomplete={mode === 'login' ? 'current-password' : 'new-password'}
		/>
		<button class="btn block" disabled={busy}>{mode === 'login' ? 'Inloggen' : 'Account maken'}</button>
		{#if message}<p class="small">{message}</p>{/if}
	</form>

	<button class="btn ghost" onclick={() => (mode = mode === 'login' ? 'signup' : 'login')}>
		{mode === 'login' ? 'Nog geen account? Maak er een' : 'Ik heb al een account'}
	</button>
</main>

<style>
	.login {
		max-width: 400px;
		text-align: center;
		padding-top: calc(env(safe-area-inset-top) + 15vh);
	}
	form {
		margin: 24px 0 12px;
		text-align: left;
	}
</style>
