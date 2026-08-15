import { useEffect, useMemo, useState } from 'react';
import type { SubmitErrorHandler } from 'react-hook-form';
import { useForm, useFieldArray } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Pencil, Trash2, ChefHat } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogFooter, DialogHeader } from '@/components/ui/dialog';
import {
  useCreateRecipe,
  useDeleteRecipe,
  useRecipeCost,
  useRecipes,
  useUpdateRecipeMutation,
} from '@/features/recipes/hooks/use-recipes';
import { useIngredients } from '@/features/inventory/hooks/use-ingredients';
import { useFood } from '@/features/food/hooks/use-food';
import type { Recipe } from '@/api/endpoints/recipes';
import { ApiException } from '@/types/api';

const lineSchema = z.object({
  ingredientId: z.string().min(1, 'Pick an ingredient'),
  quantity: z.coerce.number({ invalid_type_error: 'Must be a number' }).positive('Must be > 0'),
});

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  foodItemId: z.string().optional().default(''),
  description: z.string().optional().default(''),
  yield: z.coerce.number().min(1).optional().default(1),
  status: z.enum(['DRAFT', 'APPROVED']).default('APPROVED'),
  preparationStepsText: z.string().optional().default(''),
  ingredients: z.array(lineSchema).min(1, 'Add at least one ingredient'),
});

type FormValues = z.infer<typeof schema>;

export function RecipesPage(): JSX.Element {
  const { data, isLoading } = useRecipes();
  const { data: ingredients = [] } = useIngredients();
  const { data: foodItems = [] } = useFood();
  const [editing, setEditing] = useState<Recipe | null>(null);
  const [opening, setOpening] = useState(false);

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { ingredients: [] } });
  const { register, handleSubmit, control, reset, formState: { errors } } = form;
  const { fields, append, remove } = useFieldArray({ control, name: 'ingredients' });

  const createMutation = useCreateRecipe();
  const updateMutation = useUpdateRecipeMutation();
  const deleteMutation = useDeleteRecipe();

  // Lookup table so recipe cards can render ingredient names instead of IDs.
  const ingredientNameById = useMemo(
    () => new Map(ingredients.map((ing) => [ing.id, ing.name])),
    [ingredients],
  );

  useEffect(() => {
    if (opening && editing) {
      reset({
        name: editing.name,
        foodItemId: editing.foodItemId ?? '',
        description: editing.description ?? '',
        yield: editing.yield ?? 1,
        status: (editing.status === 'DRAFT' ? 'DRAFT' : 'APPROVED'),
        preparationStepsText: (editing.preparationSteps ?? []).join('\n'),
        ingredients: editing.ingredients.map((i) => ({ ingredientId: i.ingredientId, quantity: i.quantity })),
      });
    } else if (opening && !editing) {
      reset({
        name: '',
        foodItemId: '',
        description: '',
        yield: 1,
        status: 'APPROVED',
        preparationStepsText: '',
        ingredients: [],
      });
    }
  }, [opening, editing, reset]);

  const onInvalid: SubmitErrorHandler<FormValues> = (formErrors) => {
    const entries = Object.entries(formErrors);
    const summary = entries
      .map(([key, value]) => {
        const v = value as { message?: string } | undefined;
        return v?.message ? `${key}: ${v.message}` : key;
      })
      .join('; ');
    console.warn('[recipes] validation failed', formErrors);
    toast.error(summary || 'Please fix the highlighted fields');
  };

  async function onSubmit(values: FormValues) {
    console.log('[recipes] onSubmit values', values);
    const ingredientMap = new Map(ingredients.map((ing) => [ing.id, ing]));
    const enrichedIngredients = values.ingredients.map((line) => {
      const ing = ingredientMap.get(line.ingredientId);
      return {
        ingredientId: line.ingredientId,
        quantity: line.quantity,
        unit: ing?.unit ?? 'pcs',
        optional: false,
        notes: null,
      };
    });
    // Backend RecipeCreateRequest only accepts {name, ingredients, preparationSteps, servingSize}.
    const preparationSteps = (values.preparationStepsText ?? '')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const payload = {
      name: values.name,
      foodItemId: values.foodItemId || null,
      ingredients: enrichedIngredients,
      preparationSteps,
      servingSize: values.yield ?? 1,
    };
    try {
      if (editing && editing.id) {
        await updateMutation.mutateAsync({ id: editing.id, input: payload });
        toast.success(`Updated ${values.name}`);
      } else {
        await createMutation.mutateAsync(payload);
        toast.success(`Created ${values.name}`);
      }
      setOpening(false);
      setEditing(null);
    } catch (error) {
      const message = error instanceof ApiException ? error.message : 'Failed to save recipe';
      toast.error(message);
      console.error('[recipes] save failed', error);
    }
  }

  async function onDelete(recipe: Recipe) {
    if (!confirm(`Delete ${recipe.name}?`)) return;
    try {
      await deleteMutation.mutateAsync(recipe.id);
      toast.success(`Deleted ${recipe.name}`);
    } catch (error) {
      toast.error(error instanceof ApiException ? error.message : 'Delete failed');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-500">{data?.length ?? 0} recipes</p>
        <Button onClick={() => { setEditing(null); setOpening(true); }}>
          <Plus className="mr-2 h-4 w-4" /> New recipe
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-44" />)}
        </div>
      ) : data?.length === 0 ? (
        <Card className="text-center text-sm text-zinc-500">No recipes yet. Create one to start linking food items.</Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data?.map((recipe) => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              foodName={recipe.foodItemId ? foodItems.find((f) => f.id === recipe.foodItemId)?.name : null}
              ingredientNameById={ingredientNameById}
              onEdit={() => { setEditing(recipe); setOpening(true); }}
              onDelete={() => onDelete(recipe)}
            />
          ))}
        </div>
      )}

      <Dialog
        open={opening}
        onOpenChange={(o) => { setOpening(o); if (!o) setEditing(null); }}
        title={editing ? 'Edit recipe' : 'New recipe'}
        description="Define the ingredient composition for this menu item."
        className="max-w-2xl"
      >
        <form className="space-y-4" onSubmit={handleSubmit(onSubmit, onInvalid)} noValidate>
          <div>
            <Label htmlFor="name">Name</Label>
            <Input id="name" {...register('name')} className="mt-1" />
            {errors.name ? <p className="mt-1 text-xs text-red-600">{errors.name.message}</p> : null}
          </div>
          <div>
            <Label htmlFor="foodItemId">Linked food item</Label>
            <Select id="foodItemId" {...register('foodItemId')} className="mt-1">
              <option value="">— Not linked —</option>
              {foodItems.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </Select>
            <p className="mt-1 text-xs text-zinc-500">Required for the Allocations page to find this recipe when allocating the food item to a store.</p>
          </div>
          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" {...register('description')} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="preparationStepsText">Preparation steps</Label>
            <Textarea
              id="preparationStepsText"
              {...register('preparationStepsText')}
              className="mt-1 min-h-[160px] font-mono text-sm"
              placeholder={'e.g.\n1. Toast the bun until golden.\n2. Grill the patty 3 minutes per side.\n3. Assemble with lettuce, tomato, sauce.'}
            />
            <p className="mt-1 text-xs text-zinc-500">
              One step per line. Saved as a list and shown in the mobile recipe viewer.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="yield">Yield</Label>
              <Input id="yield" type="number" step="1" {...register('yield')} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="status">Status</Label>
              <Select id="status" {...register('status')} className="mt-1">
                <option value="APPROVED">Approved</option>
                <option value="DRAFT">Draft</option>
              </Select>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <Label>Ingredients</Label>
              <Button type="button" variant="outline" onClick={() => append({ ingredientId: '', quantity: 1 })}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Add
              </Button>
            </div>
            <div className="mt-2 space-y-2">
              {fields.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-zinc-200 p-4 text-center text-xs text-zinc-500">
                  No ingredients yet.
                </p>
              ) : (
                fields.map((field, index) => (
                  <div key={field.id} className="flex items-end gap-2">
                    <div className="flex-1">
                      <Label htmlFor={`ing-${index}`} className="sr-only">Ingredient</Label>
                      <Select {...register(`ingredients.${index}.ingredientId`)}>
                        <option value="">Select ingredient…</option>
                        {ingredients.map((ing) => (
                          <option key={ing.id} value={ing.id}>
                            {ing.name} ({ing.unit})
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="w-28">
                      <Label htmlFor={`qty-${index}`} className="sr-only">Quantity</Label>
                      <Input id={`qty-${index}`} type="number" step="0.01" {...register(`ingredients.${index}.quantity`)} />
                    </div>
                    <Button type="button" variant="ghost" onClick={() => remove(index)}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                ))
              )}
            </div>
            {errors.ingredients ? (
              <p className="mt-1 text-xs text-red-600">{errors.ingredients.message ?? errors.ingredients.root?.message}</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpening(false)}>Cancel</Button>
            <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
              {editing ? 'Save changes' : 'Create recipe'}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </div>
  );
}

function RecipeCard({ recipe, foodName, ingredientNameById, onEdit, onDelete }: { recipe: Recipe; foodName?: string | null; ingredientNameById: Map<string, string>; onEdit: () => void; onDelete: () => void }): JSX.Element {
  const { data: cost } = useRecipeCost(recipe.id);
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-zinc-950 text-white">
            <ChefHat className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-zinc-950">{recipe.name}</p>
            <p className="text-xs text-zinc-500">{recipe.ingredients.length} ingredients</p>
            <p className={`mt-0.5 text-xs ${foodName ? 'text-emerald-700' : 'text-amber-600'}`}>
              {foodName ? `Linked → ${foodName}` : '⚠ Not linked to a food item'}
            </p>
          </div>
        </div>
        <Badge>{recipe.status ?? 'APPROVED'}</Badge>
      </div>
      {recipe.description ? <p className="text-sm text-zinc-600">{recipe.description}</p> : null}
      {recipe.ingredients.length > 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Ingredients</p>
          <ul className="mt-1 space-y-0.5 text-xs text-zinc-700">
            {recipe.ingredients.map((line, idx) => (
              <li key={`${line.ingredientId}-${idx}`} className="flex items-center justify-between">
                <span className="font-medium text-zinc-950">
                  {ingredientNameById.get(line.ingredientId) ?? line.ingredientId}
                </span>
                <span className="text-zinc-500">
                  {line.quantity} {line.unit ?? ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {recipe.preparationSteps && recipe.preparationSteps.length > 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
            Preparation ({recipe.preparationSteps.length} steps)
          </p>
          <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-xs text-zinc-700">
            {recipe.preparationSteps.slice(0, 4).map((step, idx) => (
              <li key={idx}>{step}</li>
            ))}
            {recipe.preparationSteps.length > 4 ? (
              <li className="list-none text-zinc-400">+ {recipe.preparationSteps.length - 4} more…</li>
            ) : null}
          </ol>
        </div>
      ) : null}
      {cost ? (
        <p className="rounded-2xl bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
          Cost: <span className="font-semibold text-zinc-950">${cost.totalCost.toFixed(2)}</span> ({cost.lines.length} lines)
        </p>
      ) : null}
      <div className="mt-auto flex justify-end gap-1">
        <Button variant="ghost" onClick={onEdit}><Pencil className="h-4 w-4" /></Button>
        <Button variant="ghost" onClick={onDelete}><Trash2 className="h-4 w-4 text-red-500" /></Button>
      </div>
    </Card>
  );
}
