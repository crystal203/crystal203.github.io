// Run in a temporary Unity editor project prepared by bake-fixed-emission.py.
using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEngine;

public static class BakeFixedEmission {
    [Serializable] public class Request { public Job[] systems; }
    [Serializable] public class Job { public string prefab, preset, path, signature; public uint seed; public int count; }
    [Serializable] public class Particle { public float[] position; public int[] flip; public uint randomSeed; }
    [Serializable] public class Record { public string preset, path, signature; public uint seed; public Particle[] particles; }
    [Serializable] public class Result { public int version = 1; public string unityVersion; public Record[] systems; }

    public static void Run() {
        try {
            var root = Directory.GetParent(Application.dataPath).FullName;
            var request = JsonUtility.FromJson<Request>(File.ReadAllText(Path.Combine(root, "request.json")));
            var camera = new GameObject("bake-camera").AddComponent<Camera>();
            camera.transform.position = new Vector3(0, 0, -10); camera.transform.LookAt(Vector3.zero);
            var result = new Result { unityVersion = Application.unityVersion, systems = request.systems.Select(job => Bake(job, camera)).ToArray() };
            File.WriteAllText(Path.Combine(root, "result.json"), JsonUtility.ToJson(result, true));
            EditorApplication.Exit(0);
        } catch (Exception error) { Debug.LogException(error); EditorApplication.Exit(1); }
    }

    static Record Bake(Job job, Camera camera) {
        var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(job.prefab);
        if (!prefab) throw new InvalidOperationException("Missing prefab: " + job.prefab);
        var instance = UnityEngine.Object.Instantiate(prefab);
        try {
            var node = string.IsNullOrEmpty(job.path) ? instance.transform : instance.transform.Find(job.path);
            var ps = node ? node.GetComponent<ParticleSystem>() : null;
            if (!ps || ps.useAutoRandomSeed || ps.randomSeed != job.seed)
                throw new InvalidOperationException("Source seed/path mismatch: " + job.path);
            var main = ps.main;
            if (main.simulationSpace != ParticleSystemSimulationSpace.Local || main.startSpeed.constant != 0 || main.gravityModifier.constant != 0)
                throw new InvalidOperationException("Only stationary local bursts can be baked: " + job.path);
            ps.Stop(false, ParticleSystemStopBehavior.StopEmittingAndClear);
            ps.Simulate(.05f, false, true, true);
            var particles = new ParticleSystem.Particle[main.maxParticles];
            var count = ps.GetParticles(particles);
            if (count != job.count) throw new InvalidOperationException("Native burst count mismatch: " + job.path);
            // Texture assets are unnecessary for birth sampling. Use a unit quad
            // to read the native per-particle Flip stream, independent of atlas UVs.
            var sheet = ps.textureSheetAnimation; sheet.enabled = false;
            var renderer = ps.GetComponent<ParticleSystemRenderer>();
            renderer.sortMode = ParticleSystemSortMode.None;
            var material = new Material(Shader.Find("Sprites/Default")); renderer.sharedMaterial = material;
            var mesh = new Mesh(); renderer.BakeMesh(mesh, camera, false);
            var uv = mesh.uv;
            renderer.flip = Vector3.zero; renderer.BakeMesh(mesh, camera, false);
            var original = mesh.uv;
            if (uv.Length != count * 4 || original.Length != uv.Length)
                throw new InvalidOperationException("Expected one quad per particle: " + job.path);
            var output = new Particle[count];
            for (int i = 0; i < count; i++) {
                var p = particles[i];
                if (p.velocity.sqrMagnitude > 1e-12f) throw new InvalidOperationException("Particle moved during bake");
                var a = uv[i * 4]; var b = original[i * 4];
                output[i] = new Particle { position = new[] { p.position.x, p.position.y, p.position.z },
                    flip = new[] { Mathf.Abs(a.x - b.x) > .5f ? 1 : 0, Mathf.Abs(a.y - b.y) > .5f ? 1 : 0 }, randomSeed = p.randomSeed };
            }
            UnityEngine.Object.DestroyImmediate(mesh); UnityEngine.Object.DestroyImmediate(material);
            return new Record { preset = job.preset, path = job.path, signature = job.signature, seed = ps.randomSeed, particles = output };
        } finally { UnityEngine.Object.DestroyImmediate(instance); }
    }
}
