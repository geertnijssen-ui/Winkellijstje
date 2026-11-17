<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';

	let { open = $bindable(false), title, children }: { open: boolean; title: string; children: Snippet } = $props();

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') open = false;
	}
</script>

<svelte:window {onkeydown} />

{#if open}
	<div class="backdrop" onclick={() => (open = false)} role="presentation"></div>
	<div class="sheet" role="dialog" aria-modal="true" aria-label={title}>
		<header>
			<strong>{title}</strong>
			<button class="icon-btn" onclick={() => (open = false)} aria-label="Sluiten"><Icon name="close" /></button>
		</header>
		<div class="body">{@render children()}</div>
	</div>
{/if}

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 60;
		background: rgb(0 0 0 / 0.35);
		animation: fade 0.15s;
	}
	.sheet {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 61;
		max-width: 640px;
		margin: 0 auto;
		max-height: 88vh;
		display: flex;
		flex-direction: column;
		background: var(--bg);
		border-radius: 20px 20px 0 0;
		padding-bottom: env(safe-area-inset-bottom);
		animation: up 0.2s ease-out;
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 8px 4px 20px;
		font-size: 18px;
	}
	.body {
		overflow-y: auto;
		padding: 8px 16px 24px;
	}
	@keyframes up {
		from {
			transform: translateY(40px);
			opacity: 0;
		}
	}
	@keyframes fade {
		from {
			opacity: 0;
		}
	}
</style>
