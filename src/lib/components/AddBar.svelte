<script lang="ts">
	import { app } from '$lib/app.svelte';
	import { frequent, suggest } from '$lib/grouping';
	import { formatQuantity, parseItem } from '$lib/parse';
	import type { Product } from '$lib/types';

	let text = $state('');
	let focused = $state(false);
	let input: HTMLInputElement;

	const parsed = $derived(parseItem(text));
	const suggestions = $derived(suggest(app.snap, parsed.name));
	const quick = $derived(frequent(app.snap, 12));
	const onList = $derived(new Set(app.snap.items.filter((i) => !i.checked_at).map((i) => i.product_id)));

	function add(name = parsed.name) {
		if (!name.trim()) return;
		app.addItem(name, parsed.quantity, parsed.unit, parsed.note);
		text = '';
		input?.focus();
	}

	function pick(p: Product) {
		add(p.name);
	}

	function quickAdd(p: Product) {
		app.addItem(p.name);
	}
</script>

<div class="addbar">
	<form
		onsubmit={(e) => {
			e.preventDefault();
			add();
		}}
	>
		<input
			bind:this={input}
			bind:value={text}
			class="input"
			placeholder="Wat moet er in huis? Bv. 2 melk"
			enterkeyhint="done"
			autocomplete="off"
			autocorrect="off"
			onfocus={() => (focused = true)}
			onblur={() => setTimeout(() => (focused = false), 150)}
		/>
		<button class="btn" disabled={!parsed.name} aria-label="Toevoegen">+</button>
	</form>

	{#if text && (parsed.quantity || parsed.unit || parsed.note)}
		<p class="hint small muted">
			Wordt: <strong>{parsed.name}</strong>
			{#if parsed.quantity || parsed.unit}· {formatQuantity(parsed.quantity, parsed.unit)}{/if}
			{#if parsed.note}· “{parsed.note}”{/if}
		</p>
	{/if}

	{#if focused && suggestions.length > 0}
		<ul class="card suggestions row-list">
			{#each suggestions as p (p.id)}
				<li>
					<button type="button" onmousedown={(e) => e.preventDefault()} onclick={() => pick(p)}>
						<span>{p.name}</span>
						{#if onList.has(p.id)}<span class="small muted">staat erop · +1</span>{/if}
					</button>
				</li>
			{/each}
		</ul>
	{:else if focused && !text && quick.length > 0}
		<div class="quick">
			<span class="small muted">Vaak gekocht</span>
			<div class="chips">
				{#each quick as p (p.id)}
					<button type="button" class="chip" onmousedown={(e) => e.preventDefault()} onclick={() => quickAdd(p)}>
						{p.favorite ? '★ ' : ''}{p.name}
					</button>
				{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	.addbar {
		position: relative;
	}
	form {
		display: flex;
		gap: 8px;
	}
	form .btn {
		width: 48px;
		padding: 0;
		font-size: 26px;
		font-weight: 400;
	}
	.hint {
		margin: 6px 4px 0;
	}
	.suggestions {
		position: absolute;
		left: 0;
		right: 56px;
		top: 52px;
		z-index: 10;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.suggestions button {
		width: 100%;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 8px;
		min-height: 46px;
		padding: 0 14px;
		border: 0;
		background: none;
		text-align: left;
	}
	.quick {
		margin-top: 10px;
	}
	.chips {
		display: flex;
		gap: 8px;
		overflow-x: auto;
		padding: 6px 0 2px;
		scrollbar-width: none;
	}
</style>
