<script lang="ts">
	import { onMount } from 'svelte';
	import { app } from '$lib/app.svelte';
	import { supabase } from '$lib/supabase';
	import { updater } from '$lib/update.svelte';
	import { currentSubscription, disablePush, enablePush, pushSupport } from '$lib/push';
	import type { ApiToken } from '$lib/types';
	import Icon from '$lib/components/Icon.svelte';

	let pushState = $state<'loading' | 'on' | 'off' | 'install-first' | 'unsupported'>('loading');
	let pushError = $state<string | null>(null);
	let tokens = $state<ApiToken[]>([]);
	let tokenName = $state('');
	let newToken = $state<string | null>(null);
	let showUpdate = $state(false);
	let confirmDeploy = $state(false);

	onMount(async () => {
		const support = pushSupport();
		if (support !== 'ok') pushState = support;
		else pushState = (await currentSubscription()) ? 'on' : 'off';
		loadTokens();
	});

	async function loadTokens() {
		const { data } = await supabase.from('api_tokens').select('id, name, user_id, created_at, last_used_at').order('created_at');
		tokens = data ?? [];
	}

	async function togglePush() {
		pushError = null;
		try {
			if (pushState === 'on') {
				await disablePush();
				pushState = 'off';
			} else {
				await enablePush(app.userId!);
				pushState = 'on';
			}
		} catch (e) {
			pushError = e instanceof Error ? e.message : String(e);
		}
	}

	async function createToken(e: SubmitEvent) {
		e.preventDefault();
		const { data, error } = await supabase.rpc('create_api_token', { p_name: tokenName || 'Siri' });
		if (error) return app.showToast(error.message);
		newToken = data as string;
		tokenName = '';
		loadTokens();
	}

	async function deleteToken(id: string) {
		if (!confirm('Deze sleutel intrekken? Snelkoppelingen die hem gebruiken werken dan niet meer.')) return;
		await supabase.from('api_tokens').delete().eq('id', id);
		loadTokens();
	}

	function copy(text: string) {
		navigator.clipboard?.writeText(text).then(() => app.showToast('Gekopieerd'));
	}

	function openUpdate() {
		showUpdate = !showUpdate;
		confirmDeploy = false;
		if (showUpdate) updater.loadInfo();
	}

	const origin = typeof location !== 'undefined' ? location.origin : '';
</script>

<main class="page">
	<h1>Meer</h1>

	<h2>Jij</h2>
	<div class="card pad stack">
		<label class="field">
			<span class="small muted">Je naam (zien anderen bij wat je toevoegt)</span>
			<input class="input" value={app.me?.display_name ?? ''} onchange={(e) => app.setDisplayName((e.currentTarget as HTMLInputElement).value.trim())} />
		</label>
		<p class="small muted">Ingelogd als {app.session?.user.email}</p>
	</div>

	<h2>Huishouden</h2>
	<div class="card pad stack">
		<div>
			<strong>{app.snap.household?.name}</strong>
			<p class="small muted">{app.snap.profiles.map((p) => p.display_name).join(' & ')}</p>
		</div>
		<div class="code-row">
			<span class="small muted">Uitnodigingscode</span>
			<button class="code" onclick={() => copy(app.snap.household?.invite_code ?? '')}>{app.snap.household?.invite_code}</button>
		</div>
		<p class="small muted">Je partner maakt een account aan en vult deze code in.</p>
	</div>

	<h2>Meldingen</h2>
	<div class="card pad stack">
		<p class="small">Krijg een seintje als iemand iets toevoegt terwijl jij in de winkelmodus staat.</p>
		{#if pushState === 'install-first'}
			<p class="small muted">Op iPhone werken meldingen alleen als de app op je beginscherm staat: tik in Safari op Delen → “Zet op beginscherm” en open de app van daaruit.</p>
		{:else if pushState === 'unsupported'}
			<p class="small muted">Dit toestel of deze browser ondersteunt geen meldingen.</p>
		{:else}
			<button class="btn block" class:secondary={pushState === 'on'} disabled={pushState === 'loading'} onclick={togglePush}>
				{pushState === 'on' ? 'Meldingen uitzetten' : 'Meldingen aanzetten'}
			</button>
		{/if}
		{#if pushError}<p class="small" style="color: var(--danger)">{pushError}</p>{/if}
	</div>

	<h2>Siri en Google Home</h2>
	<div class="card pad stack">
		<p class="small">
			Een sleutel laat een Siri-snelkoppeling of het Google Keep-script items toevoegen. Behandel hem als een wachtwoord.
			De uitleg staat in <code>docs/SIRI.md</code> en <code>docs/GOOGLE-HOME.md</code> in de repo.
		</p>
		{#if newToken}
			<div class="token">
				<p class="small"><strong>Je nieuwe sleutel</strong> (je ziet hem maar één keer):</p>
				<button class="code wide" onclick={() => copy(newToken!)}>{newToken}</button>
				<p class="small muted">Toevoegen: <code>POST {origin}/api/items</code> · Lijst: <code>GET {origin}/api/list?format=text</code></p>
			</div>
		{/if}
		{#if tokens.length > 0}
			<div class="row-list">
				{#each tokens as t (t.id)}
					<div class="token-row">
						<div>
							<div>{t.name}</div>
							<div class="small muted">
								{app.profileName(t.user_id)} · {t.last_used_at ? `laatst gebruikt ${new Date(t.last_used_at).toLocaleDateString('nl-BE')}` : 'nog niet gebruikt'}
							</div>
						</div>
						<button class="icon-btn" onclick={() => deleteToken(t.id)} aria-label="Intrekken"><Icon name="trash" size={18} /></button>
					</div>
				{/each}
			</div>
		{/if}
		<form class="inline" onsubmit={createToken}>
			<input class="input" placeholder="Naam, bv. Siri Geert" bind:value={tokenName} />
			<button class="btn secondary">Maak sleutel</button>
		</form>
	</div>

	<h2>Beheer</h2>
	<div class="card row-list">
		<a class="list-row link" href="/producten"><Icon name="list" size={20} /> Producten en hun winkels</a>
		<a class="list-row link" href="/winkels"><Icon name="store" size={20} /> Winkels en afdelingen</a>
		<button class="list-row link" onclick={() => supabase.auth.signOut()}><Icon name="back" size={20} /> Uitloggen</button>
	</div>

	<div class="update">
		<button class="btn ghost small" onclick={openUpdate}><Icon name="refresh" size={16} /> Update</button>
		<span class="small muted">versie {updater.version.slice(0, 7)}</span>
	</div>

	{#if showUpdate}
		<div class="card pad stack small">
			{#if updater.waiting}
				<p><strong>Een nieuwe versie staat klaar.</strong></p>
				<button class="btn block" onclick={() => updater.apply()}>Nu herladen</button>
			{:else if updater.building}
				<p>Netlify is aan het bouwen. Dat duurt meestal 1 à 2 minuten. Je krijgt bovenaan een melding als de nieuwe versie klaar is.</p>
			{:else if updater.info}
				{#if updater.info.ahead === null}
					<p class="muted">Ik kan niet zien hoeveel wijzigingen er op GitHub staan (GITHUB_REPO/GITHUB_TOKEN niet ingesteld).</p>
				{:else if updater.info.ahead === 0}
					<p>Je hebt de nieuwste versie. Er staan geen nieuwe wijzigingen op GitHub.</p>
				{:else}
					<p><strong>{updater.info.ahead} nieuwe wijziging{updater.info.ahead === 1 ? '' : 'en'} op GitHub:</strong></p>
					<ul class="commits">
						{#each updater.info.commits as c (c.sha)}<li>{c.message}</li>{/each}
					</ul>
				{/if}
				{#if updater.info.canDeploy && updater.info.ahead !== 0}
					{#if confirmDeploy}
						<p>Een build kost Netlify-credits. Zeker?</p>
						<div class="inline">
							<button class="btn" onclick={() => updater.deploy()}>Ja, bouw de nieuwe versie</button>
							<button class="btn secondary" onclick={() => (confirmDeploy = false)}>Nee</button>
						</div>
					{:else}
						<button class="btn block" onclick={() => (confirmDeploy = true)}>Nieuwe versie bouwen</button>
					{/if}
				{:else if !updater.info.canDeploy}
					<p class="muted">NETLIFY_BUILD_HOOK is niet ingesteld, zie docs/SETUP.md.</p>
				{/if}
			{:else if !updater.error}
				<p class="muted">Even kijken…</p>
			{/if}
			{#if updater.error}<p style="color: var(--danger)">{updater.error}</p>{/if}
		</div>
	{/if}
</main>

<style>
	.pad {
		padding: 14px 16px;
	}
	.pad p {
		margin: 0;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.code-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.code {
		font: 600 20px ui-monospace, SFMono-Regular, Menlo, monospace;
		letter-spacing: 0.15em;
		background: var(--surface-2);
		border: 0;
		border-radius: 10px;
		padding: 6px 12px;
	}
	.code.wide {
		font-size: 13px;
		letter-spacing: 0;
		width: 100%;
		overflow-wrap: anywhere;
		text-align: left;
	}
	.token {
		background: var(--accent-soft);
		padding: 12px;
		border-radius: 12px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.token-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 8px 0;
	}
	.inline {
		display: flex;
		gap: 8px;
	}
	.link {
		width: 100%;
		border: 0;
		background: none;
		color: var(--text);
		text-decoration: none;
		text-align: left;
	}
	.update {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin: 28px 0 8px;
	}
	.commits {
		margin: 0;
		padding-left: 18px;
	}
	code {
		font-size: 12px;
		overflow-wrap: anywhere;
	}
</style>
