<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { app } from '$lib/app.svelte';
	import { updater } from '$lib/update.svelte';
	import Icon from '$lib/components/Icon.svelte';

	let { children } = $props();

	onMount(() => {
		app.start();
		updater.register();
	});

	const path = $derived(page.url.pathname);
	const publicRoute = $derived(path === '/login');
	const fullscreen = $derived(publicRoute || path === '/welkom' || path.startsWith('/winkel/'));

	$effect(() => {
		if (!app.authReady) return;
		if (!app.session && !publicRoute) goto('/login', { replaceState: true });
		else if (app.session && publicRoute) goto('/', { replaceState: true });
		else if (app.session && app.dataReady && !app.householdId && path !== '/welkom' && app.me)
			goto('/welkom', { replaceState: true });
	});

	const tabs = [
		{ href: '/', label: 'Lijst', icon: 'list' },
		{ href: '/winkels', label: 'Winkels', icon: 'store' },
		{ href: '/favorieten', label: 'Favorieten', icon: 'star' },
		{ href: '/instellingen', label: 'Meer', icon: 'settings' }
	];
</script>

{#if !app.authReady || (app.session && !app.dataReady && !publicRoute)}
	<div class="splash"><img src="/icon.svg" alt="" width="72" height="72" /></div>
{:else}
	{#if !app.online || app.outbox.length > 0}
		<div class="status" class:offline={!app.online}>
			<Icon name={app.online ? 'refresh' : 'cloudOff'} size={14} />
			{#if !app.online}
				Offline{app.outbox.length ? ` · ${app.outbox.length} wijziging${app.outbox.length === 1 ? '' : 'en'} wacht${app.outbox.length === 1 ? '' : 'en'}` : ''}
			{:else}
				Synchroniseren…
			{/if}
		</div>
	{/if}

	{@render children()}

	{#if updater.waiting}
		<button class="update-banner" onclick={() => updater.apply()}>
			<Icon name="refresh" size={16} /> Nieuwe versie klaar · tik om te herladen
		</button>
	{/if}

	{#if !fullscreen && app.session}
		<nav class="tabbar">
			{#each tabs as tab (tab.href)}
				{@const active = tab.href === '/' ? path === '/' : path.startsWith(tab.href)}
				<a href={tab.href} class:active>
					<Icon name={tab.icon} />
					<span>{tab.label}</span>
				</a>
			{/each}
		</nav>
	{/if}
{/if}

{#if app.toast}
	{#key app.toast.id}
		<div class="toast" class:raised={!fullscreen} role="status">
			<span>{app.toast.message}</span>
			{#if app.toast.action}
				<button
					onclick={() => {
						app.toast?.action?.();
						app.toast = null;
					}}>{app.toast.actionLabel}</button
				>
			{/if}
		</div>
	{/key}
{/if}

<style>
	.splash {
		position: fixed;
		inset: 0;
		display: grid;
		place-items: center;
	}
	.status {
		position: sticky;
		top: 0;
		z-index: 30;
		display: flex;
		gap: 6px;
		justify-content: center;
		align-items: center;
		padding: calc(env(safe-area-inset-top) + 4px) 12px 4px;
		font-size: 13px;
		background: var(--accent-soft);
		color: var(--accent);
	}
	.status.offline {
		background: var(--surface-2);
		color: var(--muted);
	}
	.tabbar {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 20;
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		height: calc(var(--tabbar-h) + env(safe-area-inset-bottom));
		padding-bottom: env(safe-area-inset-bottom);
		background: color-mix(in srgb, var(--surface) 88%, transparent);
		backdrop-filter: blur(16px);
		-webkit-backdrop-filter: blur(16px);
		border-top: 1px solid var(--line);
	}
	.tabbar a {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 2px;
		font-size: 11px;
		color: var(--muted);
		text-decoration: none;
	}
	.tabbar a.active {
		color: var(--accent);
	}
	.toast {
		position: fixed;
		left: 12px;
		right: 12px;
		bottom: calc(env(safe-area-inset-bottom) + 16px);
		z-index: 50;
		max-width: 520px;
		margin: 0 auto;
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 16px;
		border-radius: 14px;
		background: #222622;
		color: #fff;
		box-shadow: 0 8px 24px rgb(0 0 0 / 0.25);
		animation: rise 0.2s ease-out;
	}
	.toast.raised {
		bottom: calc(var(--tabbar-h) + env(safe-area-inset-bottom) + 12px);
	}
	.toast span {
		flex: 1;
	}
	.toast button {
		border: 0;
		background: none;
		color: #8fe0b2;
		font-weight: 700;
		padding: 4px;
	}
	.update-banner {
		position: fixed;
		top: calc(env(safe-area-inset-top) + 8px);
		left: 50%;
		transform: translateX(-50%);
		z-index: 40;
		display: flex;
		gap: 6px;
		align-items: center;
		border: 0;
		border-radius: 999px;
		padding: 8px 14px;
		background: var(--accent);
		color: var(--accent-text);
		font-size: 14px;
		font-weight: 600;
		box-shadow: var(--shadow);
		white-space: nowrap;
	}
	@keyframes rise {
		from {
			transform: translateY(12px);
			opacity: 0;
		}
	}
</style>
